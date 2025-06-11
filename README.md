# AI-F Project

AI-F là hệ thống ứng dụng AI cho nhận diện món ăn, gợi ý công thức và quản lý thực đơn, gồm backend (Python Flask), frontend (React + Vite), và tích hợp Firebase.

## Cấu trúc thư mục

```
AI-F/
│
├── backend/           # Backend Python Flask
│   ├── app/           # Mã nguồn backend
│   ├── data/          # Dữ liệu mẫu
│   └── models/        # Model AI (không commit lên git)
│
├── frontend/          # Frontend React
│   └── src/
│
├── config/            # Các file cấu hình (firebase, tailwind, vite...)
├── scripts/           # Script cài đặt, tiện ích
├── node_modules/      # Thư viện node (bỏ qua git)
├── tf-env/            # Python virtual env (bỏ qua git)
├── .gitignore
├── LICENSE
├── package.json
├── README.md
└── ...
```

## Hướng dẫn cài đặt

1. Cài đặt Python, Node.js, npm.
2. Tạo virtualenv: `python -m venv tf-env`
3. Cài backend: `pip install -r backend/requirements.txt`
4. Cài frontend: `cd frontend && npm install`

## Chạy ứng dụng

- Backend: `python backend/app/main.py`
- Frontend: `cd frontend && npm run dev`

## Giấy phép

MIT License. Xem file LICENSE để biết chi tiết.
