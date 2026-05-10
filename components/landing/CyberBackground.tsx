"use client";

import React from 'react';

const CyberBackground: React.FC = () => {
  return (
    <div
      className="cyber-scene"
      role="img"
      aria-label="Animated cybercore grid background"
    >
      <div className="cyber-floor" />
      <div className="cyber-main-column" />
      <div className="cyber-scanlines" />
      <div className="cyber-vignette" />
    </div>
  );
};

export default CyberBackground;
