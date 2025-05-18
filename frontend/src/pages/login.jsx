import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  auth,
  signInWithGoogle,
  signInAsGuest,
} from "../config/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import EnterAnimation from "../components/enterAnimaion";
import { motion } from "framer-motion";
import { useToast } from "../components/toastContext";
import axios from "axios";

const LoginForm = () => {
  const navigate = useNavigate();
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const texts = [
    "Tìm công thức cho thực đơn của bạn với sự hỗ trợ của trí tuệ nhân nhân tạo! 😎",
    "Không biết nấu món gì cho hôm nay? Để RecipeAI giúp bạn!",
    "Chỉ cần đăng nhập và tải lên hình ảnh món ăn, mọi chuyện sẽ trở nên dễ dàng... 👉🏻",
  ];
  const { showToast } = useToast();
  useEffect(() => {
    const isGuestLogin = localStorage.getItem("guestUser") === "true";
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (user.isAnonymous && !isGuestLogin) {
          auth.signOut().then(() => localStorage.removeItem("guestUser"));
        } else {
          navigate("/RecipeAI");
        }
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    let timeout;
    const currentFullText = texts[currentTextIndex];

    if (isTyping) {
      // Đang gõ văn bản
      if (displayedText.length < currentFullText.length) {
        // Tiếp tục gõ cho đến khi hoàn thành
        timeout = setTimeout(() => {
          setDisplayedText(currentFullText.slice(0, displayedText.length + 2));
        }, 50);
      } else {
        // Đã gõ xong - tạm dừng trước khi xóa
        timeout = setTimeout(() => {
          setIsTyping(false);
          setIsDeleting(true);
        }, 2000);
      }
    } else if (isDeleting) {
      // Đang xóa văn bản
      if (displayedText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayedText(displayedText.slice(0, -3));
        }, 30);
      } else {
        // Đã xóa xong - chuyển sang văn bản tiếp theo
        setIsDeleting(false);
        setIsTyping(true);
        setCurrentTextIndex((prevIndex) => (prevIndex + 1) % texts.length);
        timeout = setTimeout(() => {}, 500);
      }
    }

    return () => clearTimeout(timeout);
  }, [displayedText, isTyping, isDeleting, currentTextIndex]);

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithGoogle();
      const user = auth.currentUser;

      if (!result || !user) return;

      // Gửi thông tin người dùng lên FastAPI
      await axios.post("http://localhost:8000/user", {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });

      showToast({
        type: "success",
        message: "Đăng nhập thành công!",
        duration: 2000,
      });

      navigate("/RecipeAI");
    } catch (error) {
      if (error.code === "auth/popup-closed-by-user") {
        console.log("Popup closed by user.");
      } else {
        console.error(error);
        showToast({
          type: "error",
          message: "Đăng nhập thất bại. Vui lòng thử lại!",
          duration: 2000,
        });
      }
    }
  };

  const handleGuestSignIn = async () => {
    await signInAsGuest();
    localStorage.setItem("guestUser", "true");
    showToast({
      type: "info",
      message: "Chế độ khách sẽ không lưu lịch sử",
      duration: 2000,
    });
    navigate("/RecipeAI");
  };

  return (
    <div className="font-openSans text-xl flex min-h-screen items-center justify-center bg-gray-100">
      <EnterAnimation>
        <div
          className="flex w-full overflow-hidden rounded-lg shadow-lg bg-white"
          style={{ height: "700px" }}
        >
          {/* Left Panel */}
          <div className="hidden md:flex w-1/2 flex-col justify-center bg-secondary p-32 text-white">
            <h2 className="text-4xl font-bold mb-8">👨‍🍳 RecipeAI</h2>
            <div className="h-24">
              <div className="relative">
                <span className="whitespace-pre-wrap">
                  {displayedText}
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      repeatType: "reverse",
                    }}
                    className="w-1 h-5 mb-1 bg-white inline-block align-middle"
                  ></motion.span>
                </span>
              </div>
            </div>
          </div>

          {/* Right Panel - Login */}
          <div className="w-full md:w-1/2 p-28 flex flex-col justify-center">
            <div className="mb-6 flex items-center justify-center">
              <span className="text-4xl font-bold mr-3 bg-gradient-to-b from-yellow-600 to-red-700 text-transparent bg-clip-text">
                AI-F
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="70px"
                viewBox="0 -960 960 960"
                width="70px"
                fill="url(#gradient)"
              >
                <defs>
                  <linearGradient
                    id="gradient"
                    x1="50%"
                    y1="0%"
                    x2="50%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#d97706" /> {/* amber-600 */}
                    <stop offset="100%" stopColor="#b91c1c" /> {/* red-700 */}
                  </linearGradient>
                </defs>
                <path d="m175-120-56-56 410-410q-18-42-5-95t57-95q53-53 118-62t106 32q41 41 32 106t-62 118q-42 44-95 57t-95-5l-50 50 304 304-56 56-304-302-304 302Zm118-342L173-582q-54-54-54-129t54-129l248 250-128 128Z" />
              </svg>
            </div>
            <div className="mb-6 text-center">
              <h2 className="text-3xl font-bold text-gray-800">
                Chào mừng bạn trở lại!
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Vui lòng chọn phương thức đăng nhập để tiếp tục
              </p>
            </div>
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="font-semibold flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-lg text-gray-700 shadow-sm hover:bg-gray-100"
              >
                <svg
                  className="mr-2 h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
                Đăng nhập với Google
              </button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-5 text-gray-500">Hoặc</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleGuestSignIn}
                className="font-semibold w-full rounded-lg bg-secondary px-4 py-2 text-lg text-white hover:bg-black"
              >
                Tiếp tục với chế độ khách
              </button>
            </div>
          </div>
        </div>
      </EnterAnimation>
    </div>
  );
};

export default LoginForm;
