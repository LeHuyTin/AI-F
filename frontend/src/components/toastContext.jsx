import React, { createContext, useContext, useState } from "react";
import Toast from "../components/toast";
import { AnimatePresence } from "framer-motion";

// Tạo context
const ToastContext = createContext();

// Custom hook để sử dụng toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = ({
    id,
    message,
    type = "info",
    duration = 5000,
    onClose,
  }) => {
    const toastId = id || Date.now();
    setToasts((prevToasts) => {
      // Nếu message rỗng, xóa toast cùng id
      if (id && (!message || message === "")) {
        return prevToasts.filter((toast) => toast.id !== id);
      }
      // Nếu đã có toast cùng id, ghi đè
      if (id) {
        const others = prevToasts.filter((toast) => toast.id !== id);
        return [...others, { id, message, type, duration, onClose }];
      }
      // Nếu không có id, thêm mới
      return [...prevToasts, { id: toastId, message, type, duration, onClose }];
    });
    return toastId;
  };

  const closeToast = (id) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, closeToast }}>
      {children}
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => {
              closeToast(toast.id);
              if (toast.onClose) toast.onClose();
            }}
          />
        ))}
      </AnimatePresence>
    </ToastContext.Provider>
  );
};
