const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ==========================================
// 1. CƠ SỞ DỮ LIỆU TẠM THỜI (Mô phỏng Database)
// ==========================================

// Danh sách Học sinh / Giáo viên (Do Giáo viên quản lý)
const USERS = [
    { id: 1, username: 'hs_nguyenana', pass: '123456', name: 'Nguyễn Văn A', role: 'student' },
    { id: 2, username: 'teacher_minh', pass: 'admin123', name: 'Thầy Minh', role: 'teacher' }
];

// Ngân hàng Bài tập (Phân cấp Cơ bản, Nâng cao, Khó)
const PROBLEMS = [
    {
        id: 'P01',
        title: 'Tính tổng 2 số',
        level: 'easy',
        category: 'Toán cơ bản',
        description: 'Nhập vào 2 số a và b. In ra tổng a + b.',
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
        level: 'medium', // Bài nâng cao
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
        level: 'hard', // Bài khó
        category: 'Mảng',
        description: 'Nhập số N, sau đó nhập N số nguyên. In ra giá trị lớn nhất.',
        testcases: [
            { input: '4\n1 9 3 5', expectedOutput: '9' }
        ]
    }
];

// Lịch sử bài đã hoàn thành của học sinh
const COMPLETED_PROBLEMS = {}; // Ví dụ: { 1: ['P01', 'P02'] }

// ==========================================
// 2. API QUẢN LÝ ĐĂNG NHẬP & BÀI TẬP
// ==========================================

// API Đăng nhập
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = USERS.find(u => u.username === username && u.pass === password);
    
    if (user) {
        res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
    } else {
        res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không đúng!' });
    }
});

// API Lấy danh sách bài tập phù hợp với học sinh
app.get('/api/problems/:userId', (req, res) => {
    const userId = req.params.userId;
    const completed = COMPLETED_PROBLEMS[userId] || [];

    // Lấy danh sách bài tập đã phân loại
    const easyProblems = PROBLEMS.filter(p => p.level === 'easy');
    const mediumProblems = PROBLEMS.filter(p => p.level === 'medium');
    const hardProblems = PROBLEMS.filter(p => p.level === 'hard');

    // Logic gợi ý bài tập nâng cao:
    // Nếu học sinh đã làm xong ít nhất 1 bài Cơ bản -> Mở khóa bài Nâng cao
    const showMedium = easyProblems.some(p => completed.includes(p.id));
    // Nếu làm xong bài Nâng cao -> Mở khóa bài Khó
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

// API Thêm học sinh mới (Dành cho Giáo viên)
app.post('/api/admin/add-student', (req, res) => {
    const { username, password, name } = req.body;
    
    if (USERS.some(u => u.username === username)) {
        return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại!' });
    }

    const newStudent = {
        id: USERS.length + 1,
        username,
        pass: password,
        name,
        role: 'student'
    };
    
    USERS.push(newStudent);
    res.json({ success: true, message: 'Thêm học sinh thành công!', student: newStudent });
});

// ==========================================
// 3. XỬ LÝ NỘP BÀI & CẬP NHẬT TIẾN ĐỘ
// ==========================================
// (Kết hợp logic Judge0 & Gemini AI từ bản trước)
app.post('/api/submit', async (req, res) => {
    const { userId, problemId, code, language } = req.body;
    const problem = PROBLEMS.find(p => p.id === problemId);

    if (!problem) return res.status(404).json({ error: 'Không tìm thấy bài tập' });

    // Gọi Judge0 chấm bài với testcases của bài tập đó...
    // [Giữ nguyên logic chấm bài đã viết ở câu trước]
    
    const isSuccess = true; // Ví dụ giả định chấm bài thành công (Pass 100%)

    if (isSuccess) {
        // Lưu tiến độ học sinh
        if (!COMPLETED_PROBLEMS[userId]) COMPLETED_PROBLEMS[userId] = [];
        if (!COMPLETED_PROBLEMS[userId].includes(problemId)) {
            COMPLETED_PROBLEMS[userId].push(problemId);
        }

        return res.json({
            status: 'SUCCESS',
            message: 'Chúc mừng bạn đã hoàn thành bài tập!',
            nextRecommendation: 'Bạn đã đủ điều kiện để thử sức với bài tập ở cấp độ cao hơn!'
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));