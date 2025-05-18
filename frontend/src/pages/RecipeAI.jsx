import React, { useState, useEffect, useRef } from "react";
import { auth, logOut } from "../config/firebaseConfig";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged } from "firebase/auth";
import "../index.css";
import { useToast } from "../components/toastContext";
import ReactDOMServer from "react-dom/server";
import VoiceWaveform from "../components/VoiceWaveform";
import ReactMarkdown from "react-markdown";
import { Gem } from "lucide-react";

const RecipeAI = () => {
  const GEMINI_API = import.meta.env.VITE_GEMINI_API_KEY;
  const { showToast } = useToast();
  const [firstDish, setFirstDish] = useState(null);
  // sidebar
  const [showChatSidebar, setShowChatSidebar] = useState(false);
  const [showUserSidebar, setShowUserSidebar] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  // loading
  const [isLoading, setIsLoading] = useState(false);
  // sidebar lịch sử chat
  const [editingId, setEditingId] = useState(null);
  const [showMenuId, setShowMenuId] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [showSearch, setShowSearch] = useState(false);
  // login logout
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isGuestUser, setIsGuestUser] = useState(false);
  //khung chat
  const chatContainerRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  // upload ảnh
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const [image, setImage] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  // voice input
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");

  // Đăng nhập
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        if (currentUser.isAnonymous) {
          setUser(currentUser);
          setIsGuestUser(true);
          localStorage.setItem("guestUser", "true");
        } else {
          setUser(currentUser);
          setIsGuestUser(false);
          localStorage.removeItem("guestUser");
        }
      } else if (localStorage.getItem("guestUser") === "true") {
        setUser(null);
        setIsGuestUser(true);
      } else {
        setUser(null);
        setIsGuestUser(false);
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Khởi tạo dữ liệu khi đăng nhập
  useEffect(() => {
    // Chỉ gọi khi user đã xác định (null hoặc object), tránh undefined
    if (isGuestUser) {
      initializeUserData();
      setIsLoading(false);
    } else if (user && user.uid) {
      initializeUserData();
      setIsLoading(false);
    }
  }, [user, isGuestUser]);

  // Đăng xuất
  const handleLogout = async () => {
    try {
      // Lấy danh sách sessionId của user
      const res = await fetch(`http://localhost:8000/sessions/${user?.uid}`);
      const data = await res.json();
      const sessions = data.sessions || data;

      // Xóa session không có message
      for (const session of sessions) {
        const msgRes = await fetch(
          `http://localhost:8000/messages?sessionId=${session.sessionId}`
        );
        const msgData = await msgRes.json();
        if (!msgData.messages || msgData.messages.length === 0) {
          await fetch(`http://localhost:8000/session/${session.sessionId}`, {
            method: "DELETE",
          });
        }
      }

      const result = await logOut();
      if (result.success) {
        setUser(null);
        setIsGuestUser(false);
        setConversations([]);
        setActiveConversation(null);
        setMessages([]);
        showToast({
          type: "",
          message: "Hẹn gặp lại!",
          duration: 1000,
        });
        navigate("/login");
      } else {
        console.error("Lỗi đăng xuất:", result.error);
      }
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
    }
  };

  //  Chỉnh sửa tên cuộc trò chuyện
  const editConversation = async (id, newTitle) => {
    // Cập nhật tiêu đề trong state
    setConversations((prev) =>
      prev.map((conv) =>
        conv.sessionId === id ? { ...conv, title: newTitle } : conv
      )
    );

    // Nếu là khách thì chỉ cập nhật local, không gọi backend
    if (isGuestUser) {
      setEditingId(null);
      return;
    }

    // Gửi yêu cầu cập nhật tiêu đề lên backend cho user thật
    try {
      const response = await fetch(`http://localhost:8000/session/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(
          "Failed to update conversation title in backend:",
          errorData
        );
        return;
      }

      console.log("Conversation title updated successfully in backend");
    } catch (error) {
      console.error("Error updating conversation title in backend:", error);
    }

    // Đặt lại trạng thái chỉnh sửa
    setEditingId(null);
  };

  // Upload ảnh
  const handleImageUpload = () => {
    fileInputRef.current.click();
  };
  const handleFileChange = (event) => {
    const file = event.target.files[0];

    if (file) {
      const imageUrl = URL.createObjectURL(file);
      console.log("Uploaded Image URL:", imageUrl);
      setImage(imageUrl);
      setSelectedImage(imageUrl);
      setIsOpen(false);
    }
  };

  // AI trả lời
  const generateRecipeResponse = async (query) => {
    try {
      const response = await fetch("http://localhost:8000/recipes_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        return await callGeminiAPI(query);
      }

      const result = await response.json();

      // Tìm thấy công thức trong db
      if (result.type === "recipe") {
        const { name, ingredients, cooking_method } = result.data;

        const message = (
          <div>
            <h2>Đây là công thức cho món {name}</h2>
            <br />
            <h3>Nguyên liệu:</h3>
            <ul>
              {ingredients.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
            <br />
            <h3>Cách nấu:</h3>
            <ol>
              {cooking_method.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </div>
        );

        return { message, firstDish: name };
      }

      // Trường hợp: Lỗi (type: "error")
      if (result.type === "error") {
        return await callGeminiAPI(query);
      }
      // Trường hợp không xác định
      throw new Error("Kết quả từ API không hợp lệ.");
    } catch (error) {
      return await callGeminiAPI(query);
    }
  };

  // Gemini trả lời
  const callGeminiAPI = async (query) => {
    const greetings = ["hi", "hello", "chào", "xin chào", "alo"];
    const normalizedQuery = query.trim().toLowerCase();
    const isGreeting = greetings.some((greet) =>
      normalizedQuery.startsWith(greet)
    );
    if (isGreeting) {
      return {
        message: (
          <div>
            <p>
              Chào bạn! Thực đơn hôm nay của bạn là gì? Mình sẽ hỗ trợ hết mình
              để bạn có một bữa ăn ngon 😋.
            </p>
          </div>
        ),
      };
    }

    // Danh sách từ khóa liên quan đến nấu ăn
    const cookingKeywords = [
      "nấu",
      "cách làm",
      "công thức",
      "món ăn",
      "nguyên liệu",
      "chế biến",
      "làm món",
      "món",
      "ăn",
      "đi",
      "",
    ];

    // Kiểm tra nếu query không liên quan đến nấu ăn
    const isCookingRelated = cookingKeywords.some((kw) =>
      query.toLowerCase().includes(kw)
    );
    if (!isCookingRelated) {
      return {
        message: (
          <div>
            <p>
              Mình là chatbot hỗ trợ nấu ăn, bạn muốn tìm công thức cho món ăn
              nào hoặc cần mình gợi ý món ăn theo nguyên liệu sẵn có thì cho
              mình biết nhé.
            </p>
          </div>
        ),
      };
    }

    // gọi Gemini API
    try {
      const prompt = `Bạn là trợ lý AI chuyên về ẩm thực. Nếu người dùng cần tìm công thức cho món ăn, 
        hãy trả lời câu hỏi sau theo cấu trúc (không có dấu gạch đầu dòng ở các đề mục):
        - Đây là công thức cho món: Tên món ăn
        - Nguyên liệu: (dưới dạng danh sách)
        - Cách nấu: (dưới dạng danh sách)
        Nếu người dùng hỏi về các món ăn có thể nấu từ nguyên liệu, 
        hãy trả lời theo đúng cấu trúc sau:
        Với (nguyên liệu), bạn có thể nấu các món sau:
        - [Tên món 1] 
        - [Tên món 2] 
        ...
        Ở phần dưới cùng sẽ đưa ra đoạn text mô tả hoặc câu chúc ngắn gọn (nếu là công thức nấu ăn của món đó).
        Bạn muốn mình hướng dẫn chi tiết cách làm cho món nào trên đó không? (nếu hỏi về các món ăn có thể nấu từ nguyên liệu).
        (KHÔNG dùng in đậm, KHÔNG dùng icon, chỉ text thường, chỉ cần khoảng cách giữa các phần nội dung) Nếu không tìm thấy công thức, hãy trả lời: "Xin lỗi, mình không tìm thấy công thức phù hợp."
        Câu hỏi: ${query}`;

      const geminiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
          GEMINI_API,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      const geminiData = await geminiRes.json();
      const geminiMessage =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Xin lỗi, mình không tìm thấy công thức phù hợp.";

      // Kiểm tra nếu Gemini trả về công thức
      const match = geminiMessage.match(
        /Đây là công thức cho món[:\s]*([^\n]+)\s+Nguyên liệu:\s+([\s\S]+?)\s+Cách nấu:\s+([\s\S]+)/
      );

      if (match) {
        const dishName = match[1].trim();
        const ingredients = match[2]
          .split("\n")
          .map((item) => item.replace(/^-/, "").trim());
        const cookingMethod = match[3]
          .split("\n")
          .map((step) => step.replace(/^\d+\./, "").trim());

        // Lưu món ăn vào DB nếu chưa tồn tại
        await saveRecipeToDB(dishName, ingredients, cookingMethod);

        return {
          message: (
            <div>
              <h2>Đây là công thức cho món {dishName}</h2>
              <br />
              <h3>Nguyên liệu:</h3>
              <ul>
                {ingredients.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
              <br />
              <h3>Cách nấu:</h3>
              <ol>
                {cookingMethod.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          ),
          firstDish: dishName,
        };
      }

      return {
        message: (
          <div>
            <p>{geminiMessage}</p>
          </div>
        ),
      };
    } catch (err) {
      return {
        message: (
          <div>
            <p>🤔 Không tìm thấy công thức và cũng không thể kết nối Gemini.</p>
          </div>
        ),
      };
    }
  };

  // Hàm lưu món ăn vào DB
  const saveRecipeToDB = async (name, ingredients, cookingMethod) => {
    try {
      const validIngredients = Array.isArray(ingredients)
        ? ingredients
        : ingredients
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);

      const validCookingMethod = Array.isArray(cookingMethod)
        ? cookingMethod
        : cookingMethod
            .split("\n")
            .map((step) => step.trim())
            .filter(Boolean);

      const payload = {
        id: Date.now(),
        name,
        ingredients: validIngredients,
        cooking_method: validCookingMethod,
      };

      const response = await fetch("http://localhost:8000/add-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // const errorData = await response.json();
        // console.error("Lỗi khi lưu món ăn vào DB:", errorData);
      } else {
        // const result = await response.json();
        // console.log("Món ăn đã được lưu vào DB:", result);
      }
    } catch (error) {
      console.error("Lỗi khi kết nối đến API để lưu món ăn:", error);
    }
  };

  // Xử lý gửi tin nhắn
  const handleSendMessage = async () => {
    if ((!inputMessage.trim() && !selectedImage) || isLoading) return;

    console.log(
      "User Message:",
      inputMessage,
      "Image Uploaded:",
      selectedImage
    );

    const userMessage = {};
    if (inputMessage.trim()) userMessage.text = inputMessage;
    if (selectedImage) userMessage.image = selectedImage;
    addUserMessage(userMessage);

    // Lưu tin nhắn người dùng vào backend
    if (!isGuestUser) {
      await saveMessageToBackend(
        activeConversation.sessionId,
        "user",
        inputMessage,
        selectedImage
      );
    }

    setIsLoading(true);

    try {
      if (selectedImage) {
        let fileToSend = selectedImage;

        if (
          typeof selectedImage === "string" &&
          selectedImage.startsWith("blob:")
        ) {
          const response = await fetch(selectedImage);
          const blob = await response.blob();
          fileToSend = new File([blob], "image.jpg", { type: "image/jpeg" });
        }

        const formData = new FormData();
        formData.append("file", fileToSend);

        const response = await fetch(
          "http://localhost:8000/predict_with_recipe",
          {
            method: "POST",
            body: formData,
          }
        );

        const result = await response.json();

        if (response.ok) {
          const { predicted_label: label, recipe, confidence } = result;

          if (!recipe || confidence < 0.8) {
            const aiText =
              "🤔 Mình không nhận diện được món ăn nào trong ảnh, bạn có thể gửi một ảnh khác được không?";
            addAIMessage({ text: aiText });

            // Lưu phản hồi AI
            if (!isGuestUser) {
              await saveMessageToBackend(
                activeConversation.sessionId,
                "ai",
                aiText,
                null
              );
            }
          } else {
            const aiText = (
              <div>
                <h2>Đây là {label}. Công thức chi tiết như sau:</h2>
                <br />
                <h3>Nguyên liệu:</h3>
                <ul>
                  {recipe.ingredients.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
                <br />
                <h3>Cách nấu:</h3>
                <ol>
                  {recipe.cooking_method.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            );

            const aiPlainText = `Đây là ${label}. Công thức chi tiết như sau:
              Nguyên liệu:
              ${recipe.ingredients.join("\n")}
              Cách nấu:
              ${recipe.cooking_method.join("\n")}`;

            addAIMessage({ text: aiText });
            if (!isGuestUser) {
              await saveMessageToBackend(
                activeConversation.sessionId,
                "ai",
                aiPlainText,
                null
              );
            }

            if (!firstDish) {
              setFirstDish(label);

              // Cập nhật tiêu đề trong state
              setConversations((prev) =>
                prev.map((conv) =>
                  conv.sessionId === activeConversation.sessionId
                    ? { ...conv, title: label }
                    : conv
                )
              );

              // Gửi yêu cầu cập nhật tiêu đề lên backend
              try {
                await fetch(
                  `http://localhost:8000/session/${activeConversation.sessionId}`,
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: label }),
                  }
                );
              } catch (error) {
                console.error(
                  "Error updating conversation title in backend:",
                  error
                );
              }
            }
          }
        } else {
          console.error("API error:", result);
          const errorText =
            "Đã xảy ra lỗi khi xử lý hình ảnh. Vui lòng thử lại.";
          addAIMessage({ text: errorText });
          if (!isGuestUser) {
            await saveMessageToBackend(
              activeConversation.sessionId,
              "ai",
              errorText,
              null
            );
          }
        }
      } else {
        const { message, firstDish: dishName } = await generateRecipeResponse(
          inputMessage
        );
        addAIMessage({ text: message });
        if (!isGuestUser) {
          await saveMessageToBackend(
            activeConversation.sessionId,
            "ai",
            message,
            null
          );
        }

        if (dishName && !firstDish) {
          setFirstDish(dishName);

          // Cập nhật tiêu đề trong state
          setConversations((prev) =>
            prev.map((conv) =>
              conv.sessionId === activeConversation.sessionId
                ? { ...conv, title: dishName }
                : conv
            )
          );

          // Nếu là khách thì chỉ cập nhật local, không gọi backend
          if (!isGuestUser) {
            try {
              await fetch(
                `http://localhost:8000/session/${activeConversation.sessionId}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: dishName }),
                }
              );
            } catch (error) {
              console.error("Lỗi không thể cập nhật tiêu đề:", error);
            }
          }
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
      const errorText =
        "Đã xảy ra lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại.";
      addAIMessage({ text: errorText });
      await saveMessageToBackend(
        activeConversation.sessionId,
        "ai",
        errorText,
        null
      );
    } finally {
      setInputMessage("");
      setImage(null);
      setSelectedImage(null);
      setIsLoading(false);
    }
  };

  // Hàm phụ trợ lưu tin nhắn
  const saveMessageToBackend = async (sessionId, sender, content, image) => {
    let imageData = null;

    if (typeof image === "string" && image.startsWith("blob:")) {
      const res = await fetch(image);
      const blob = await res.blob();
      const base64 = await convertBlobToBase64(blob);
      imageData = base64;
    } else if (typeof image === "string") {
      imageData = image;
    }

    // Chuyển React component thành chuỗi nếu cần
    const processedContent =
      typeof content === "object" && content.$$typeof
        ? ReactDOMServer.renderToStaticMarkup(content)
        : content;

    const message = {
      uid: user?.uid || "guest",
      sessionId,
      sender,
      content: processedContent,
      image: imageData,
      timestamp: new Date().toISOString(),
    };

    console.log("Message payload:", message); // Log dữ liệu gửi đi

    try {
      const response = await fetch("http://localhost:8000/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to save message:", errorData);
      } else {
        console.log("Message saved successfully");
      }
    } catch (error) {
      console.error("Error saving message to backend:", error);
    }
  };

  // Chuyển đổi blob thành base64
  const convertBlobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Hàm voice input
  const handleVoiceInput = () => {
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      showToast({
        type: "",
        message: "",
        duration: 500,
      });
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast({
        type: "error",
        message: "Trình duyệt của bạn không hỗ trợ nhận diện giọng nói.",
        duration: 2000,
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "vi-VN";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognitionRef.current = recognition;
    setIsRecording(true);

    showToast({
      id: "voice",
      type: "voice",
      message: <VoiceWaveform />,
      duration: 999999,
      onClose: () => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setIsRecording(false);
      },
    });
    finalTranscriptRef.current = ""; // reset trước khi bắt đầu

    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      setInputMessage(finalTranscriptRef.current + interimTranscript);
    };

    recognition.onend = () => {
      setIsRecording(false);
      showToast({ id: "voice", type: "voice", message: "", duration: 100 });

      // Lấy transcript cuối cùng từ ref
      let text = finalTranscriptRef.current.trim();

      // Nếu ref chưa có, lấy trực tiếp từ DOM textarea (luôn là mới nhất)
      if (!text && inputRef.current && inputRef.current.value.trim()) {
        text = inputRef.current.value.trim();
      }

      if (text) {
        setInputMessage(text);
        sendVoiceMessage(text);
      }
    };

    recognition.onerror = (event) => {
      setIsRecording(false);
      showToast({ id: "voice", type: "voice", message: "", duration: 100 });
      showToast({
        type: "error",
        message: "Lỗi nhận diện giọng nói: " + event.error,
        duration: 2000,
      });
    };

    recognition.start();
    setIsOpen(false);
  };

  // Gửi tin nhắn sau khi nhận diện giọng nói
  const sendVoiceMessage = async (text) => {
    if (!text.trim() || isLoading) return;

    const userMessage = { text };
    addUserMessage(userMessage);
    setInputMessage("");

    if (!isGuestUser) {
      await saveMessageToBackend(
        activeConversation.sessionId,
        "user",
        text,
        null
      );
    }

    setIsLoading(true);

    try {
      const { message, firstDish: dishName } = await generateRecipeResponse(
        text
      );
      addAIMessage({ text: message });
      if (!isGuestUser) {
        await saveMessageToBackend(
          activeConversation.sessionId,
          "ai",
          message,
          null
        );
      }
      if (dishName && !firstDish) {
        setFirstDish(dishName);
        setConversations((prev) =>
          prev.map((conv) =>
            conv.sessionId === activeConversation.sessionId
              ? { ...conv, title: dishName }
              : conv
          )
        );
        if (!isGuestUser) {
          await fetch(
            `http://localhost:8000/session/${activeConversation.sessionId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: dishName }),
            }
          );
        }
      }
    } catch (err) {
      const errorText =
        "Đã xảy ra lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại.";
      addAIMessage({ text: errorText });
      if (!isGuestUser) {
        await saveMessageToBackend(
          activeConversation.sessionId,
          "ai",
          errorText,
          null
        );
      }
    } finally {
      setInputMessage("");
      setImage(null);
      setSelectedImage(null);
      setIsLoading(false);
    }
  };

  // Xử lý Enter để gửi tin nhắn
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (inputMessage.trim() || selectedImage) {
        handleSendMessage();
        setImage(null);
        setInputMessage("");
      }
    }
  };

  // Chuyển sang đăng nhập gg khi ở chế độ khách
  const handleLogin = () => {
    setIsGuestUser(false);
    console.log("Đã thoát chế độ khách");
    navigate("/login");
  };

  // Tạo cuộc trò chuyện mới
  const handleNewConversation = async () => {
    const newConversation = {
      uid: user?.uid || "guest",
      sessionId: Date.now().toString(),
      title: `Đoạn chat ${new Date().toLocaleDateString("vi-VN")}`,
      createdAt: new Date().toISOString(),
    };

    if (isGuestUser) {
      // Khách: chỉ tạo local, không gọi API
      setConversations((prev) => [newConversation, ...prev]);
      setActiveConversation(newConversation);
      setFirstDish(null);
      setTimeout(() => {
        if (chatContainerRef.current) chatContainerRef.current.scrollTop = 0;
        if (inputRef.current) inputRef.current.focus();
      }, 200);
      return;
    }

    // Lưu session của user vào backend
    try {
      const response = await fetch("http://localhost:8000/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConversation),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to save session:", errorData);
      } else {
        console.log("Đã lưu phiên trò chuyện.");
      }
    } catch (error) {
      console.error("Lỗi khi lưu phiên trò chuyện: ", error);
    }

    // Cập nhật state
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversation(newConversation);

    setFirstDish(null);

    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = 0;
      }
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 200);
  };

  // Toggle sidebar người dùng
  const toggleUserSidebar = () => {
    setShowUserSidebar(!showUserSidebar);
  };

  // Xóa cuộc trò chuyện
  const deleteConversation = async (conversationId) => {
    if (isGuestUser) {
      const updatedConversations = conversations.filter(
        (conv) => conv.sessionId !== conversationId
      );
      const updatedMessages = messages.filter(
        (msg) => msg.conversationId !== conversationId
      );

      setConversations(updatedConversations);
      setMessages(updatedMessages);

      showToast({
        type: "success",
        message: "Đã xóa cuộc trò chuyện!",
        duration: 1000,
      });

      // Nếu cuộc trò chuyện đang hoạt động bị xóa
      if (activeConversation?.sessionId === conversationId) {
        if (updatedConversations.length > 0) {
          setActiveConversation(updatedConversations[0]);
        } else {
          handleNewConversation();
        }
      }
      return;
    }

    // Nếu không phải khách, gọi API để xóa
    try {
      // Gửi yêu cầu xóa session và lịch sử tin nhắn đến backend
      const response = await fetch(
        `http://localhost:8000/session/${conversationId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Lỗi khi xóa phiên trò chuyện: ", errorData);
        showToast({
          type: "error",
          message: "Lỗi! Không thể xóa cuộc trò chuyện.",
          duration: 1000,
        });
        return;
      }

      // Xóa cuộc trò chuyện và lịch sử tin nhắn khỏi giao diện
      const updatedConversations = conversations.filter(
        (conv) => conv.sessionId !== conversationId
      );
      const updatedMessages = messages.filter(
        (msg) => msg.conversationId !== conversationId
      );

      setConversations(updatedConversations);
      setMessages(updatedMessages);

      showToast({
        type: "success",
        message: "Đã xóa cuộc trò chuyện và lịch sử tin nhắn",
        duration: 1000,
      });

      // Nếu cuộc trò chuyện đang hoạt động bị xóa
      if (activeConversation?.sessionId === conversationId) {
        if (updatedConversations.length > 0) {
          setActiveConversation(updatedConversations[0]);
        } else {
          handleNewConversation();
        }
      }
    } catch (error) {
      console.error("Lỗi! Không thể xóa cuộc trò chuyện: ", error);
      showToast({
        type: "error",
        message: "Đã xảy ra lỗi khi xóa cuộc trò chuyện.",
        duration: 1000,
      });
    }
  };

  // Tìm kiếm
  const handleSearchConversation = () => {
    const searchInput = document.querySelector(
      'input[placeholder="Tìm kiếm..."]'
    );
    if (!searchInput) return;

    const searchValue = searchInput.value.trim().toLowerCase();
    if (!searchValue) {
      showToast({
        type: "warning",
        message: "Vui lòng nhập từ khóa để tìm kiếm.",
        duration: 1000,
      });
      return;
    }

    const foundConversation = conversations.find((conv) =>
      conv.title.toLowerCase().includes(searchValue)
    );

    if (foundConversation) {
      setActiveConversation(foundConversation);

      searchInput.value = "";
      setInputMessage("");
      setShowSearch(false);

      // Cuộn xuống cuối đoạn chat
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop =
            chatContainerRef.current.scrollHeight;
        }
      }, 100);
    } else {
      showToast({
        type: "error",
        message: "Không tìm thấy trò chuyện nào.",
        duration: 1000,
      });
    }
  };

  // Thêm tin nhắn AI
  const addAIMessage = ({ text, image = null }) => {
    if (!activeConversation) return;

    setMessages((prev) => [
      ...prev,
      {
        text: text || "",
        image,
        sender: "ai",
        timestamp: new Date(),
        conversationId: activeConversation.sessionId,
      },
    ]);
  };

  // Thêm tin nhắn người dùng
  const addUserMessage = ({ text, image = null }) => {
    if (!activeConversation) return;

    setMessages((prev) => [
      ...prev,
      {
        text: text || "",
        image,
        sender: "user",
        timestamp: new Date(),
        conversationId: activeConversation.sessionId,
      },
    ]);
  };

  // tăng chiều cao textarea
  const adjustTextareaHeight = (e) => {
    const textarea = e.target;
    textarea.style.height = "60px";
    const newHeight = Math.min(textarea.scrollHeight, 80);
    textarea.style.height = `${newHeight}px`;
  };
  // Tự động điều chỉnh chiều cao của textarea khi lần đầu tiên render
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "60px";
    }
  }, []);

  // Khởi tạo dữ liệu
  const initializeUserData = async () => {
    if (isGuestUser) {
      // Guest: luôn tạo mới session local
      const newConversation = {
        uid: "guest",
        sessionId: Date.now().toString(),
        title: `Đoạn chat ${new Date().toLocaleDateString("vi-VN")}`,
        createdAt: new Date().toISOString(),
      };
      setConversations([newConversation]);
      setActiveConversation(newConversation);
      return;
    }
    if (!user?.uid) return;

    // Luôn tạo mới session cho user thật
    const newConversation = {
      uid: user?.uid || "guest",
      sessionId: Date.now().toString(),
      title: `Đoạn chat ${new Date().toLocaleDateString("vi-VN")}`,
      createdAt: new Date().toISOString(),
    };

    try {
      const response = await fetch("http://localhost:8000/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConversation),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Lỗi! Không thể lưu phiên trò chuyện: ", errorData);
        showToast({
          type: "error",
          message: "Lỗi! Không thể lưu phiên trò chuyện.",
          duration: 1000,
        });
        return;
      }
      console.log("Đã lưu phiên trò chuyện.");
    } catch (error) {
      console.error("Đã xảy ra lỗi khi lưu phiên trò chuyện: ", error);
      showToast({
        type: "error",
        message: "Đã xảy ra lỗi khi lưu phiên trò chuyện.",
        duration: 1000,
      });
    }

    // Lấy lại danh sách session để hiển thị sidebar
    try {
      const res = await fetch(`http://localhost:8000/sessions/${user?.uid}`);
      const data = await res.json();
      const sessions = data.sessions || data;
      setConversations([
        newConversation,
        ...(sessions || [])
          .filter((s) => s.sessionId !== newConversation.sessionId)
          .reverse(),
      ]);
    } catch (err) {
      setConversations([newConversation]);
    }
    setActiveConversation(newConversation);
  };

  // Cuộn xuống cuối chat khi có tin nhắn mới
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);
  useEffect(() => {
    if (!isLoading && activeConversation && inputRef.current) {
      setTimeout(() => {
        inputRef.current.focus();
      }, 300);
    }
  }, [isLoading, activeConversation, user]);
  useEffect(() => {
    console.log("Active Conversation:", activeConversation);
  }, [activeConversation]);
  const filteredMessages = messages.filter(
    (msg) =>
      String(msg.sessionId || msg.conversationId) ===
      String(activeConversation?.sessionId)
  );

  // Đóng mở menu đoạn chat
  useEffect(() => {
    const handleClickOutside = () => setShowMenuId(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // paste text hoặc hình ảnh từ clipboard
  useEffect(() => {
    const handlePaste = (e) => {
      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;

        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            e.preventDefault();

            const file = items[i].getAsFile();

            if (file) {
              const imageUrl = URL.createObjectURL(file);
              console.log("Pasted Image URL:", imageUrl);
              setImage(imageUrl);
              setSelectedImage(imageUrl);

              if (inputRef.current) {
                setTimeout(() => {
                  inputRef.current.focus();
                }, 100);
              }
              break;
            }
          }
        }
      }
    };

    // Đăng ký event listener cho textarea
    const textarea = inputRef.current;
    if (textarea) {
      textarea.addEventListener("paste", handlePaste);
    }
    return () => {
      if (textarea) {
        textarea.removeEventListener("paste", handlePaste);
      }
    };
  }, [inputRef.current]);

  // render lịch sử chat của session
  useEffect(() => {
    if (!isGuestUser && activeConversation?.sessionId) {
      fetch(
        `http://localhost:8000/messages?sessionId=${activeConversation.sessionId}`
      )
        .then((res) => res.json())
        .then((data) => {
          setMessages(data.messages || []);
        })
        .catch((err) => {
          console.error("Lỗi khi lấy lịch sử tin nhắn:", err);
        });
    } else if (isGuestUser) {
      setMessages([]); // Khách thì không có lịch sử
    }
  }, [isGuestUser, activeConversation]);

  // Giao diện
  return (
    <div className="font-openSans flex h-screen text-black relative overflow-hidden bg-gray-100">
      {/*  overlay sidebar */}
      {showUserSidebar ||
        (showSearch && (
          <div
            className="fixed inset-0 transiton ease z-10 backdrop-blur-sm"
            onClick={() => {
              setShowUserSidebar(false);
              setShowSearch(false);
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }}
          />
        ))}

      {/*btn lịch sử*/}
      <button
        onClick={() => {
          setShowChatSidebar(!showChatSidebar);
          setIsOpen(false);
        }}
        className="absolute top-3 left-4 p-2 text-black bg-gray-100 hover:bg-gray-300 transition duration-300 rounded-xl"
        title="Lịch sử trò chuyện"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8 transition-transform duration-100 transform hover:rotate-180"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M21 19V5c0-1.103-.897-2-2-2H5c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h14c1.103 0 2-.897 2-2zm-11 0V5h9l.002 14H10z"></path>
        </svg>
      </button>

      {/* Sidebar lịch sử trò chuyện */}
      <div
        className={`fixed top-0 left-0 h-full z-20 w-80 bg-secondary p-4 transform transition-transform duration-300 ease-in-out overflow-visible  ${
          showChatSidebar ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex justify-between items-center mb-4 pb-4 border-gray-400 top-0">
          {/* btn lịch sử */}
          <button
            onClick={() => {
              setShowChatSidebar(false);
              setShowSearch(false);
              setIsOpen(false);
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }}
            className=" text-white hover:bg-gray-500 transition duration-300 rounded-xl p-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{ transform: "rotate(180deg)" }}
            >
              <path d="M21 19V5c0-1.103-.897-2-2-2H5c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h14c1.103 0 2-.897 2-2zm-11 0V5h9l.002 14H10z"></path>
            </svg>
          </button>

          <div className="flex items-center space-x-1 pr-0">
            {/* Ô input tìm kiếm */}
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Tìm kiếm..."
                className={`bg-gray-500 h-12 text-white rounded-xl py-2 pl-4 pr-10 focus:outline-none transition duration-100 absolute right-12 ${
                  showSearch
                    ? "w-48 opacity-100"
                    : "w-0 opacity-0 pointer-events-none"
                }`}
                style={{ right: "-1px" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearchConversation();
                  }
                }}
              />

              {/* btn tìm kiếm */}
              <button
                className={`text-white transition duration-300 p-2 flex items-center justify-center z-10 ${
                  showSearch
                    ? "bg-gray-500 rounded-r-xl"
                    : "rounded-xl hover:bg-gray-500"
                }`}
                onClick={() => {
                  if (showSearch) {
                    handleSearchConversation();
                  } else {
                    setShowSearch(true);
                    setTimeout(() => {
                      const searchInput = document.querySelector(
                        'input[placeholder="Tìm kiếm..."]'
                      );
                      if (searchInput) {
                        searchInput.focus();
                      }
                    }, 100);
                  }
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-8 h-8"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 2a8 8 0 105.293 14.293l4.707 4.707a1 1 0 001.414-1.414l-4.707-4.707A8 8 0 0010 2zm-6 8a6 6 0 1112 0 6 6 0 01-12 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* btn thêm */}
            <button
              onClick={() => {
                handleNewConversation();
                setShowSearch(false);
              }}
              className="text-white hover:bg-gray-500 transition duration-300 p-2 rounded flex items-center justify-center rounded-xl"
              title="Tạo cuộc trò chuyện mới"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="32px"
                viewBox="0 -960 960 960"
                width="32px"
                fill="#e3e3e3"
              >
                <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v268q-19-9-39-15.5t-41-9.5v-243H200v560h242q3 22 9.5 42t15.5 38H200Zm0-120v40-560 243-3 280Zm80-40h163q3-21 9.5-41t14.5-39H280v80Zm0-160h244q32-30 71.5-50t84.5-27v-3H280v80Zm0-160h400v-80H280v80ZM720-40q-83 0-141.5-58.5T520-240q0-83 58.5-141.5T720-440q83 0 141.5 58.5T920-240q0 83-58.5 141.5T720-40Zm-20-80h40v-100h100v-40H740v-100h-40v100H600v40h100v100Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Danh sách cuộc trò chuyện */}
        <div
          className="space-y-2 overflow-y-auto pr-5 custom-scrollbar"
          style={{ height: "660px" }}
        >
          {conversations.map((conv) => (
            <div
              key={conv.sessionId}
              className={`relative p-2 rounded cursor-pointer duration-300 flex justify-between items-center group overflow-hidden ${
                activeConversation?.sessionId === conv.sessionId
                  ? "text-black bg-gray-300"
                  : "text-white hover:bg-gray-500 hover:text-black"
              }`}
              onClick={() => {
                console.log("Chuyển sang đoạn chat:", conv);
                setActiveConversation(conv);
                setShowSearch(false);

                setTimeout(() => {
                  if (chatContainerRef.current) {
                    chatContainerRef.current.scrollTop =
                      chatContainerRef.current.scrollHeight;
                  }
                }, 100);
              }}
            >
              {/* sửa tên chat */}
              <div className="relative flex items-center w-full">
                {editingId === conv.sessionId ? (
                  <input
                    className="p-1 border rounded bg-transparent focus:outline-none focus:ring-0 focus:border-transparent"
                    style={{
                      width: "220px",
                      boxSizing: "border-box",
                      paddingTop: "0",
                      paddingBottom: "0",
                      lineHeight: "1.35",
                    }}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        editConversation(conv.sessionId, newTitle);
                        setEditingId(null);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{
                      width: "222px",
                      maskImage:
                        "linear-gradient(to right, rgba(0, 0, 0, 1) 90%, rgba(0, 0, 0, 0))",
                      WebkitMaskImage:
                        "linear-gradient(to right, rgba(0, 0, 0, 1) 90%, rgba(0, 0, 0, 0))",
                    }}
                  >
                    {conv.title}
                  </span>
                )}

                {/* Menu chức năng xóa sửa */}
                <div className="absolute right-2 pt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenuPosition({
                        top: rect.bottom,
                        left: rect.left,
                      });
                      setShowMenuId(
                        showMenuId === conv.sessionId ? null : conv.sessionId
                      );
                    }}
                    className="text-black opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="24px"
                      viewBox="0 -960 960 960"
                      width="24px"
                      fill="#000"
                    >
                      <path d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z" />
                    </svg>
                  </button>

                  {/* Menu tùy chọn xóa sửa trò chuyện */}
                  <AnimatePresence>
                    {showMenuId === conv.sessionId && (
                      <motion.div
                        className="fixed bg-gray-300 text-black justify-between rounded shadow-lg py-2 px-2 w-48 z-50"
                        style={{
                          top: `${menuPosition.top}px`,
                          left: `${menuPosition.left}px`,
                        }}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.15 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-500 mb-2 transition duration-200"
                          onClick={() => {
                            setEditingId(conv.sessionId);
                            setNewTitle(conv.title);
                            setShowMenuId(null);
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            height="24px"
                            viewBox="0 -960 960 960"
                            width="24px"
                            fill="#000"
                          >
                            <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L530-360H360Zm481-424-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z" />
                          </svg>
                          Sửa tên
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-500 transition duration-200 mt-2 "
                          onClick={() => {
                            deleteConversation(conv.sessionId);
                            setShowMenuId(null);
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            height="24px"
                            viewBox="0 -960 960 960"
                            width="24px"
                            fill="#000"
                          >
                            <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
                          </svg>
                          Xóa trò chuyện
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="absolute bottom-2 left-0 right-0 text-start">
          <div className="border-t border-gray-400 pt-5 px-2">
            <p className="text-xs text-gray-300 mt-1 font-thin">
              © Lê Huy Tín - Đại học Sài Gòn
            </p>
            <p className="text-xs text-gray-300 font-thin">
              2025 Food Recipes AI
            </p>
          </div>
        </div>
      </div>

      {/* Khung chat chính */}
      <div
        className="flex-grow flex flex-col transition-all duration-300 ease-in-out"
        style={{
          marginLeft: showChatSidebar ? "320px" : "0",
        }}
      >
        {/* Header */}
        <header
          className="bg-transparent text-black text-lg font-semibold py-3 px-6 flex justify-center items-center shadow-md transition-all duration-300 ease-in-out"
          style={{ height: "70px", minHeight: "70px" }}
        >
          {/* btn người dùng */}
          <button
            onClick={() => {
              toggleUserSidebar();
              setIsOpen(false);
            }}
            className={`absolute top-3 right-4 p-2 duration-300 ${
              showUserSidebar ? "bg-gray-300" : "bg-gray-100 hover:bg-gray-300"
            } text-black rounded-xl transition`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5.121 17.804A9 9 0 0112 15a9 9 0 016.879 2.804M12 12a4 4 0 100-8 4 4 0 000 8z"
              />
            </svg>
          </button>

          <span className="text-2xl text-bold mr-3">AI-F</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="40px"
            viewBox="0 -960 960 960"
            width="40px"
            fill="#000"
          >
            <path d="m175-120-56-56 410-410q-18-42-5-95t57-95q53-53 118-62t106 32q41 41 32 106t-62 118q-42 44-95 57t-95-5l-50 50 304 304-56 56-304-302-304 302Zm118-342L173-582q-54-54-54-129t54-129l248 250-128 128Z" />
          </svg>

          {/* Sidebar thông tin người dùng */}
          <div
            className={`fixed top-16 right-3 z-50 w-76 h-auto rounded-xl bg-gray-300 shadow-2xl p-8 transition-opacity duration-300 ${
              showUserSidebar
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 pointer-events-none"
            }`}
          >
            <div className="mb-4">
              <h2 className="text-lg font-bold text-black">Xin chào!</h2>
            </div>

            <div className="text-start">
              {isGuestUser ? (
                <>
                  <p className="text-black text-md font-normal mb-4">
                    Bạn đang ở chế độ khách. <br /> Lịch sử chat sẽ không được
                    lưu!
                  </p>
                  <button
                    onClick={handleLogin}
                    className="w-full bg-blue-700 text-white font-semibold py-2 rounded-xl hover:bg-blue-600 transition"
                  >
                    Đăng nhập ngay
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-md font-semibold text-gray-900 mb-1">
                    {user?.displayName || "Người dùng"}
                  </h3>
                  <p className="text-sm text-gray-700 mb-4">{user?.email}</p>
                  <button
                    onClick={handleLogout}
                    className="w-full bg-error text-white py-2 rounded-xl font-semibold hover:bg-red-600 transition"
                  >
                    Đăng xuất
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Màn hình chat chính */}
        <div className="flex flex-col justify-center h-full max-w-4xl mx-auto w-full">
          {/* Khung hiển thị tin nhắn */}
          <div
            ref={chatContainerRef}
            className={`max-w-4xl mx-auto ${
              filteredMessages.length > 0
                ? "flex-grow overflow-y-auto"
                : "flex items-center justify-center"
            } pt-4 pr-4 pb-4 space-y-8 custom-scrollbar overflow-x-hidden`}
            style={{ width: "999px" }}
          >
            {filteredMessages.length > 0 ? (
              filteredMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${
                    msg.sender === "ai" ? "justify-start" : "justify-end"
                  }`}
                >
                  <div
                    className={`relative max-w-4xl p-3 rounded-lg whitespace-pre-wrap break-words
          ${
            msg.sender === "ai"
              ? "text-black text-md backdrop-blur-md max-w-lg"
              : "bg-secondary text-md text-white max-w-xs"
          }
        `}
                  >
                    {msg.sender === "ai" && (
                      <div className="font-semibold text-black flex mb-2 items-center">
                        <span className="text-2xl mr-1">AI-F</span>
                      </div>
                    )}
                    {msg.image && (
                      <div className="mb-4 flex justify-center">
                        <img
                          src={msg.image}
                          alt="Uploaded"
                          className="w-auto max-w-full h-auto max-h-60 rounded-lg shadow-2xl border-2 border-white"
                        />
                      </div>
                    )}

                    {msg.text ? (
                      <span>{msg.text}</span>
                    ) : (
                      <div dangerouslySetInnerHTML={{ __html: msg.content }} /> // giữ format HTML
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 px-4 py-10">
                <p className="text-xl mb-3">
                  Hãy hỏi RecipeAI về công thức món ăn bạn muốn nấu 🍽️
                </p>
                <p className="text-sm">
                  Ví dụ: "Làm thế nào để nấu phở bò?" hoặc "Công thức làm mì
                  quảng ngon" <br /> Bạn cũng có thể tải ảnh lên để bắt đầu món
                  ăn của mình!
                </p>
              </div>
            )}

            {/* Hiệu ứng typing */}
            {isLoading && (
              <div className="flex justify-start">
                <motion.div
                  className="text-black p-4 rounded-lg bg-gray-100 bg-opacity-20 backdrop-blur-md"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex space-x-3 items-center">
                    <motion.div
                      className="w-2 h-2 rounded-full bg-gray-700"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: [0, 1, 1, 0],
                        scale: [0, 1, 1, 0],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        times: [0, 0.2, 0.8, 1],
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-gray-700"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: [0, 1, 1, 0],
                        scale: [0, 1, 1, 0],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        delay: 0.3,
                        times: [0, 0.2, 0.8, 1],
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-gray-700"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: [0, 1, 1, 0],
                        scale: [0, 1, 1, 0],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        delay: 0.6,
                        times: [0, 0.2, 0.8, 1],
                        ease: "easeInOut",
                      }}
                    />
                  </div>
                </motion.div>
              </div>
            )}
          </div>

          {/* Khung nhập tin nhắn */}
          <div className="bg-white shadow-lg p-3 mb-20 pb-5 flex flex-col items-center w-full max-w-4xl max-h-2xl mx-auto rounded-2xl pb">
            {/* Hiển thị ảnh vừa chọn nếu có */}
            {image && (
              <div className="mb-2 relative">
                <img
                  src={image}
                  alt="Preview"
                  className="w-20 h-20 object-cover rounded-lg"
                />
                <button
                  onClick={() => {
                    setImage(null);
                    setSelectedImage(null);
                  }}
                  className="absolute -top-2 -right-2 bg-gray-200 text-black rounded-full w-6 h-6 flex items-center justify-center hover:bg-white transition-colors shadow-md"
                  title="Xóa hình ảnh"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            )}

            {/* Ô nhập tin nhắn */}
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
                adjustTextareaHeight(e);
                setIsOpen(false);
              }}
              onKeyDown={handleKeyPress}
              onClick={() => {
                setIsOpen(false);
                setShowSearch(false);
                setShowUserSidebar(false);
              }}
              placeholder="Nhắn tin cho RecipeAI..."
              className="custom-scrollbar w-full min-h-[50px] h-auto max-h-[120px] p-3 bg-transparent text-black text-lg focus:outline-none resize-none"
              rows="1"
              style={{
                height: "auto",
                minHeight: "60px",
                maxHeight: "80px",
                overflowY: "auto",
              }}
            />

            {/* Menu chọn nhập hình ảnh | voice */}
            <div className="flex justify-between items-center w-full mt-2 pl-4 pr-4">
              <div className="relative">
                {
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.75 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.75 }}
                        transition={{ duration: 0.1, ease: "linear" }}
                        className="absolute left-0 transform -translate-x-1/2 bottom-14 bg-secondary text-white p-2 rounded-lg shadow-lg flex flex-col w-56 z-50"
                      >
                        {/* btn upload ảnh */}
                        <button
                          className="p-3 hover:bg-gray-500 rounded transition duration-300 flex items-center whitespace-nowrap gap-4"
                          onClick={() => {
                            handleImageUpload();
                            inputRef.current.focus();
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            height="32px"
                            viewBox="0 -960 960 960"
                            width="32px"
                            fill="#e3e3e3"
                          >
                            <path d="M480-480ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h320v80H200v560h560v-320h80v320q0 33-23.5 56.5T760-120H200Zm40-160h480L570-480 450-320l-90-120-120 160Zm440-320v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
                          </svg>
                          Hình ảnh
                        </button>

                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/png, image/jpeg, image/jpg, image/webp"
                          onChange={handleFileChange}
                          className="hidden"
                        />

                        <hr className="border-t border-gray-400 my-1" />

                        {/* btn voice */}
                        <button
                          className="p-3 hover:bg-gray-500 rounded transition duration-300 flex items-center whitespace-nowrap gap-4"
                          onClick={() => {
                            handleVoiceInput();
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            height="32px"
                            viewBox="0 -960 960 960"
                            width="32px"
                            fill="#e3e3e3"
                          >
                            <path d="M280-240v-480h80v480h-80ZM440-80v-800h80v800h-80ZM120-400v-160h80v160h-80Zm480 160v-480h80v480h-80Zm160-160v-160h80v160h-80Z" />
                          </svg>
                          {isRecording ? "Đang nghe..." : "Giọng nói"}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                }

                {/* btn option input */}
                <button
                  onClick={() => {
                    setIsOpen(!isOpen);
                    inputRef.current.focus();
                  }}
                  className={`w-12 h-12 ${
                    isOpen ? "bg-secondary" : "bg-gray-600 hover:bg-secondary"
                  } text-white p-2 rounded-full flex items-center justify-center duration-300 transition`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 4a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H5a1 1 0 110-2h6V5a1 1 0 011-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* btn send message*/}
              <button
                onClick={() => {
                  handleSendMessage();
                  setImage(null);
                  setSelectedImage(null);
                  setInputMessage("");
                }}
                disabled={isLoading || (!inputMessage.trim() && !selectedImage)}
                className={`${
                  isLoading || (!inputMessage.trim() && !selectedImage)
                    ? "bg-gray-400 cursor-not-allowed opacity-50"
                    : "bg-gray-600 hover:bg-secondary cursor-pointer"
                } w-12 h-12 text-white p-2 rounded-full flex items-center justify-center duration-300 transition`}
                title={
                  !inputMessage.trim() && !selectedImage
                    ? "Hãy nhập tin nhắn hoặc chọn ảnh"
                    : isLoading
                    ? "Đang gửi..."
                    : "Gửi tin nhắn"
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecipeAI;
