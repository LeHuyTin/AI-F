import React from "react";
import "../index.css";

const VoiceWaveform = () => {
  const delays = React.useMemo(
    () => Array.from({ length: 10 }, () => (Math.random() * 0.2).toFixed(2)),
    []
  );

  return (
    <div className="bg-gray-900 rounded-xl shadow-lg flex items-center gap-4">
      <span className="text-white font-medium">Đang lắng nghe...</span>
      <div className="flex items-end gap-1 h-6">
        {delays.map((delay, i) => (
          <span
            key={i}
            className="w-1 bg-white animate-wave"
            style={{
              animationDelay: `${delay}s`,
              animationDuration: "1s",
              animationIterationCount: "infinite",
              animationTimingFunction: "ease-in-out",
            }}
          />
        ))}
      </div>
    </div>
  );
};
export default VoiceWaveform;
