const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ==========================================
// 1. CẤU HÌNH BIẾN MÔI TRƯỜNG & KHÓA API
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";
const JUDGE0_API_URL = "https://judge0-extra-ce.p.rapidapi.com"; 
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "1nPvK3IfO6ZkjnfiUmBCd9G9tfWA8_BSoyUlahNQb_qQ"; // ID Google Sheet (nếu có)

// Mã ngôn ngữ lập trình của Judge0
const LANGUAGE_IDS = {
    'python': 71, // Python 3.8
    'cpp': 54,    // C++ (GCC 9.2.0)
    'java': 62    // Java (OpenJDK 13.0.1)
};

// ==========================================
// 2. DỮ LIỆU TẠM THỜI & NGÂN HÀNG BÀI TẬP
// ==========================================

// Danh sách mặc định (Sử dụng khi chưa kết nối Google Sheets)
const DEFAULT_USERS = [
    { id: 1, username: 'hs_nguyenana', pass: '123456', name: 'Nguyễn Văn A', role: 'student' },
    { id: 2, username: 'teacher_minh', pass: 'admin123', name: 'Thầy Minh', role: 'teacher' }
];

// Ngân hàng Bài tập phân cấp
const PROBLEMS = [
    {
        id: 'P01',
        title: 'Tính tổng 2 số',
        level: 'easy',
        category: 'Toán cơ bản',
        description: 'Viết chương trình nhập vào 2 số nguyên a và b. In ra tổng a + b.',
        testcases: [
            { input: '3\n5', expectedOutput: '8' },
            { input: '-2\n10', expectedOutput: '8' }
        ]
    },
    {
        id: 'P02',
        title: 'Kiểm tra số chẵn lẻ',
        level: 'easy',
        category: 'Câu lệnh điều kiện',
        description: 'Nhập số nguyên n. In ra "CHAN" nếu n chẵn, ngược lại in "LE".',
        testcases: [
            { input: '4', expectedOutput: 'CHAN' },
            { input: '7', expectedOutput: 'LE' }
        ]
    },
    {
        id: 'P03',
        title: 'Tính tổng dãy số từ 1 đến N',
        level: 'medium',
        category: 'Vòng lặp',
        description: 'Nhập vào số nguyên dương N. In ra tổng S = 1 + 2 + ... + N.',
        testcases: [
            { input: '5', expectedOutput: '15' },
            { input: '100', expectedOutput: '5050' }
        ]
    },
    {
        id: 'P04',
        title: 'Tìm phần tử lớn nhất trong mảng',
        level: 'hard',
        category: 'Mảng',
        description: 'Nhập số N, sau đó nhập N số nguyên. In ra giá trị lớn nhất.',
        testcases: [
            { input: '4\n1 9 3 5', expectedOutput: '9' }
        ]
    }
];

// Lịch sử bài đã hoàn thành của học sinh
const COMPLETED_PROBLEMS = {};

// ==========================================
// 3. HÀM ĐỌC DỮ LIỆU TỪ GOOGLE SHEETS
// ==========================================
async function getUsers() {
    if (!SPREADSHEET_ID) {
        return DEFAULT_USERS;
    }

    try {
        const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Users`;
        const response = await axios.get(url);
        
        // Parse dữ liệu JSON trả về từ Google Visualization API
        const jsonString = response.data.substring(47, response.data.length - 2);
        const data = JSON.parse(jsonString);

        return data.table.rows.map((row, index) => ({
            id: row.c[0] ? row.c[0].v : index + 1,
            username: row.c[1] ? String(row.c[1].v) : '',
            pass: row.c[2] ? String(row.c[2].v) : '',
            name: row.c[3] ? String(row.c[3].v) : '',
            role: row.c[4] ? String(row.c[4].v) : 'student'
        }));
    } catch (error) {
        console.error("Lỗi đọc Google Sheet, chuyển sang dùng danh sách mặc định:", error.message);
        return DEFAULT_USERS;
    }
}

// ==========================================
// 4. API QUẢN LÝ ĐĂNG NHẬP & BÀI TẬP
// ==========================================

// API Đăng nhập
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const users = await getUsers();
    const user = users.find(u => u.username === username && u.pass === password);
    
    if (user) {
        res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
    } else {
        res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không đúng!' });
    }
});

// API Lấy danh sách bài tập theo tiến độ học sinh
app.get('/api/problems/:userId', (req, res) => {
    const userId = req.params.userId;
    const completed = COMPLETED_PROBLEMS[userId] || [];

    const easyProblems = PROBLEMS.filter(p => p.level === 'easy');
    const mediumProblems = PROBLEMS.filter(p => p.level === 'medium');
    const hardProblems = PROBLEMS.filter(p => p.level === 'hard');

    // Mở khóa bài tập dựa trên tiến độ
    const showMedium = easyProblems.some(p => completed.includes(p.id));
    const showHard = mediumProblems.some(p => completed.includes(p.id));

    res.json({
        completedProblemIds: completed,
        availableProblems: {
            easy: easyProblems,
            medium: showMedium ? mediumProblems : [],
            hard: showHard ? hardProblems : []
        },
        unlockedLevels: {
            easy: true,
            medium: showMedium,
            hard: showHard
        }
    });
});

// ==========================================
// 5. XỬ LÝ CHẤM BÀI VÀ GỌI AI PHÂN TÍCH LỖI
// ==========================================

app.post('/api/submit', async (req, res) => {
    const { userId, problemId, code, language } = req.body;
    const problem = PROBLEMS.find(p => p.id === problemId);

    if (!problem) return res.status(404).json({ error: 'Không tìm thấy bài tập' });

    const langId = LANGUAGE_IDS[language] || 71;
    const testcases = problem.testcases;
    let totalTests = testcases.length;
    let passedTests = 0;
    let firstFailedResult = null;

    try {
        // 1. Chạy bài làm qua từng testcase với Judge0
        for (let i = 0; i < testcases.length; i++) {
            const tc = testcases[i];
            
            const response = await axios.post(`${JUDGE0_API_URL}/submissions?wait=true`, {
                source_code: code,
                language_id: langId,
                stdin: tc.input,
                expected_output: tc.expectedOutput
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const result = response.data;

            if (result.status.id === 3) { // Status 3 = Accepted
                passedTests++;
            } else {
                if (!firstFailedResult) {
                    firstFailedResult = {
                        testIndex: i + 1,
                        status: result.status.description,
                        stdout: result.stdout || '',
                        stderr: result.stderr || '',
                        compileOutput: result.compile_output || '',
                        input: tc.input,
                        expectedOutput: tc.expectedOutput
                    };
                }
            }
        }

        // 2. Nếu đạt 100% điểm
        if (passedTests === totalTests) {
            if (!COMPLETED_PROBLEMS[userId]) COMPLETED_PROBLEMS[userId] = [];
            if (!COMPLETED_PROBLEMS[userId].includes(problemId)) {
                COMPLETED_PROBLEMS[userId].push(problemId);
            }

            return res.json({
                status: 'SUCCESS',
                message: `Tuyệt vời! Bạn đã vượt qua ${passedTests}/${totalTests} testcases.`,
                nextRecommendation: 'Bạn đã đủ điều kiện để mở khóa/thử sức với các bài tập ở cấp độ cao hơn!'
            });
        }

        // 3. Nếu sai -> Gọi Gemini AI phân tích lỗi
        const aiAnalysis = await analyzeErrorWithGemini(
            code,
            language,
            problem.description,
            firstFailedResult
        );

        return res.json({
            status: 'FAILED',
            passedTests,
            totalTests,
            failedTestInfo: firstFailedResult,
            aiFeedback: aiAnalysis
        });

    } catch (error) {
        console.error('Lỗi khi xử lý chấm bài:', error.message);
        res.status(500).json({ error: 'Đã xảy ra lỗi trong quá trình chấm bài.' });
    }
});

/**
 * Hàm gửi dữ liệu tới Gemini AI để nhận trợ giúp sư phạm
 */
async function analyzeErrorWithGemini(code, language, problem, failedResult) {
    const prompt = `
Bạn là một trợ lý giáo viên dạy lập trình thân thiện và có tính sư phạm cao.
Học sinh đang giải bài tập sau:
---
ĐỀ BÀI:
${problem}
---
MÃ NGUỒN CỦA HỌC SINH (${language}):
\`\`\`${language}${code}
\`\`\`
---
KẾT QUẢ CHẤM BÀI:
- Trạng thái: ${failedResult.status}
- Đầu vào (Input): ${failedResult.input}
- Kết quả mong đợi (Expected Output): ${failedResult.expectedOutput}
- Kết quả thực tế của học sinh (Actual Output): ${failedResult.stdout}
- Báo lỗi (Error Log): ${failedResult.stderr || failedResult.compileOutput}

YÊU CẦU PHẢN HỒI:
1. **Chỉ ra lỗi sai**: Giải thích ngắn gọn lỗi xảy ra là gì (Lỗi cú pháp, Lỗi thuật toán hay Sai kết quả).
2. **Gợi ý hướng khắc phục**: Đưa ra hướng tư duy từng bước để học sinh tự sửa lỗi. KHÔNG cho nguyên vẹn bài giải hoàn chỉnh.
3. **Mẫu sửa lỗi tham khảo**: Chỉ đưa ra đoạn code rất nhỏ minh họa cho khái niệm bị sai (nếu cần).
`;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            }
        );

        return response.data.candidates[0].content.parts[0].text;
    } catch (err) {
        console.error('Lỗi Gemini API:', err.message);
        return "Hệ thống AI hiện không thể phân tích lỗi. Vui lòng kiểm tra lại cú pháp bài làm.";
    }
}

// Khởi chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server đang chạy tại http://localhost:${PORT}`));