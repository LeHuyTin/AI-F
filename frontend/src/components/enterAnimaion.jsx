import { motion } from "framer-motion";

export default function EnterAnimation({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.8,
        ease: "easeOut",
      }}
      className="w-3/4 h-auto bg-white shadow-2xl rounded-xl"
    >
      {children}
    </motion.div>
  );
}
