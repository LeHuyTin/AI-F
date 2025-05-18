
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInAnonymously,
  signOut 
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyA6Z7ZDwLEIm7VWO1D3tzH7utXPlR0HXR0",
  authDomain: "ai-friend-c1cec.firebaseapp.com",
  projectId: "ai-friend-c1cec",
  storageBucket: "ai-friend-c1cec.firebasestorage.app",
  messagingSenderId: "80849328485",
  appId: "1:80849328485:web:fdce4e7790aabd2021298c",
  measurementId: "G-PPPKXZ31HN",
};

// Khởi tạo ứng dụng Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Hàm đăng nhập với tư cách khách
export const signInAsGuest = async () => {
  try {
    const result = await signInAnonymously(auth);
    // Lưu trạng thái khách vào localStorage
    localStorage.setItem('guestUser', 'true');
    return { success: true, user: result.user };
  } catch (error) {
    console.error("Lỗi đăng nhập khách:", error);
    return { success: false, error: error.message };
  }
};

// Đăng xuất
export const logOut = async () => {
  try {
    localStorage.removeItem('guestUser');
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error("Lỗi đăng xuất:", error);
    return { success: false, error: error.message };
  }
};

export default app;