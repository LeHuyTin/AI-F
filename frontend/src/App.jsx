import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './pages/login';
import RecipeAI from './pages/RecipeAI';
import { ToastProvider } from "./components/toastContext";

const App = () => {
  return (
    <ToastProvider>
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/RecipeAI" element={<RecipeAI/>} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
    </ToastProvider>
  );
};

export default App;