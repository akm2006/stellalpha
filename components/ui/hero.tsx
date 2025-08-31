"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { MoveRight, Play } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
interface Beam {
  x: number;
  y: number;
  width: number;
  length: number;
  angle: number;
  speed: number;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
  layer: number;
}

function createBeam(width: number, height: number, layer: number): Beam {
  const angle = -35 + Math.random() * 10;
  const baseSpeed = 0.2 + layer * 0.2;
  const baseOpacity = 0.08 + layer * 0.05;
  const baseWidth = 10 + layer * 5;
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    width: baseWidth,
    length: height * 2.5,
    angle,
    speed: baseSpeed + Math.random() * 0.2,
    opacity: baseOpacity + Math.random() * 0.1,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.01 + Math.random() * 0.015,
    layer,
  };
}

export const StellaHero = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noiseRef = useRef<HTMLCanvasElement>(null);
  const beamsRef = useRef<Beam[]>([]);
  const animationFrameRef = useRef<number>(0);
  const [titleNumber, setTitleNumber] = useState(0);

  const LAYERS = 3;
  const BEAMS_PER_LAYER = 8;

  const cryptoTitles = ["autonomous", "gasless", "intelligent", "adaptive", "revolutionary"];

  useEffect(() => {
    const canvas = canvasRef.current;
    const noiseCanvas = noiseRef.current;
    if (!canvas || !noiseCanvas) return;
    const ctx = canvas.getContext("2d");
    const nCtx = noiseCanvas.getContext("2d");
    if (!ctx || !nCtx) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      noiseCanvas.width = window.innerWidth * dpr;
      noiseCanvas.height = window.innerHeight * dpr;
      noiseCanvas.style.width = `${window.innerWidth}px`;
      noiseCanvas.style.height = `${window.innerHeight}px`;
      nCtx.setTransform(1, 0, 0, 1, 0, 0);
      nCtx.scale(dpr, dpr);

      beamsRef.current = [];
      for (let layer = 1; layer <= LAYERS; layer++) {
        for (let i = 0; i < BEAMS_PER_LAYER; i++) {
          beamsRef.current.push(createBeam(window.innerWidth, window.innerHeight, layer));
        }
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const generateNoise = () => {
      const imgData = nCtx.createImageData(noiseCanvas.width, noiseCanvas.height);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const v = Math.random() * 255;
        imgData.data[i] = v;
        imgData.data[i + 1] = v;
        imgData.data[i + 2] = v;
        imgData.data[i + 3] = 12;
      }
      nCtx.putImageData(imgData, 0, 0);
    };

    const drawBeam = (beam: Beam) => {
      ctx.save();
      ctx.translate(beam.x, beam.y);
      ctx.rotate((beam.angle * Math.PI) / 180);

      const pulsingOpacity = Math.min(1, beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.4));
      const gradient = ctx.createLinearGradient(0, 0, 0, beam.length);
      // Changed from cyan to Stellalpha's brand colors
      gradient.addColorStop(0, `rgba(6,182,212,0)`); // cyan-500
      gradient.addColorStop(0.2, `rgba(6,182,212,${pulsingOpacity * 0.5})`);
      gradient.addColorStop(0.5, `rgba(6,182,212,${pulsingOpacity})`);
      gradient.addColorStop(0.8, `rgba(34,197,94,${pulsingOpacity * 0.3})`); // green accent
      gradient.addColorStop(1, `rgba(6,182,212,0)`);

      ctx.fillStyle = gradient;
      ctx.filter = `blur(${2 + beam.layer * 2}px)`;
      ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
      ctx.restore();
    };

    const animate = () => {
      if (!canvas || !ctx) return;


      ctx.clearRect(0, 0, canvas.width, canvas.height);

      beamsRef.current.forEach((beam) => {
        beam.y -= beam.speed * (beam.layer / LAYERS + 0.5);
        beam.pulse += beam.pulseSpeed;
        if (beam.y + beam.length < -50) {
          beam.y = window.innerHeight + 50;
          beam.x = Math.random() * window.innerWidth;
        }
        drawBeam(beam);
      });

      generateNoise();
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTitleNumber((prev) => (prev + 1) % cryptoTitles.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* <canvas ref={noiseRef} className="absolute inset-0 z-0 pointer-events-none" />
      <canvas ref={canvasRef} className="absolute inset-0 z-10" /> */}

      <div className="relative z-20 flex h-screen w-full items-center justify-start px-6 text-center pt-20 pb-8">
        <div className="container mx-auto flex flex-col items-center gap-8 text-center">
          {/* Star Logo */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-400 blur-xl opacity-50 animate-pulse"></div>
              <Image
                              src="/stellalpha.png"
                              alt="Stellalpha logo"
                              width={64}
                              height={64}
                              className="w-16 h-16"
                            />
            </div>
          </div>

          <Button 
  variant="secondary" 
  size="lg" 
  className="gap-2 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 backdrop-blur-none bg-transparent border flex items-center"
>
  {/* Avalanche logo */}
  <img 
    src="/avax.png" 
    alt="Avalanche" 
    className="w-6 h-6" 
  />
  
  Avalanche Network Powered by 0xGasless
  
  {/* 0xGasless logo */}
  <img 
    src="/gasless.png" 
    alt="0xGasless" 
    className="w-8 h-8" 
  />
</Button>

          <h1 className="text-5xl md:text-7xl max-w-4xl tracking-tighter font-regular">
            <span className="text-white">Automate Your Crypto Strategy.</span>
            <br />
            <span className="text-cyan-400">Follow the Stars.</span>
            <span className="relative flex w-full justify-center overflow-hidden md:pb-4 md:pt-1">
              &nbsp;
              {cryptoTitles.map((title, index) => (
                <motion.span
                  key={index}
                  className="absolute font-semibold text-transparent bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 bg-clip-text"
                  initial={{ opacity: 0, y: "-100" }}
                  transition={{ type: "spring", stiffness: 50 }}
                  animate={
                    titleNumber === index
                      ? { y: 0, opacity: 1 }
                      : { y: titleNumber > index ? -150 : 150, opacity: 0 }
                  }
                >
                  {title}
                </motion.span>
              ))}
            </span>
          </h1>

          <p className="text-lg md:text-xl leading-relaxed tracking-tight text-gray-300 max-w-4xl text-center">
            Stellalpha is an autonomous, gasless copy-trading agent and interactive AI assistant 
            for 0xGasless-compatible chains. Replicate successful trades on the Avalanche network, powered by AI.
          </p>

          <div className="flex flex-row gap-3 flex-wrap justify-center">
   <Link href="/dashboard" passHref>
      <Button
        size="lg"
        className="gap-4 border border-[#333] text-gray-200 font-semibold px-8 py-4 rounded-2xl transition-all duration-300 ease-in-out
                   bg-cyan-500/20
                   hover:border-cyan-400/60 hover:bg-[linear-gradient(90deg,rgba(0,246,255,0.70)_10%,rgba(59,130,246,0.25)_90%)] hover:text-white hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/25"
      >
        <Play className="w-5 h-5" />
        Launch App
      </Button>
    </Link>
         <Link
      href="https://github.com/akm2006/stellalpha/blob/main/README.md"
      target="_blank"
      rel="noopener noreferrer"
    >
      <Button
  size="lg"
  variant="outline"
  className="gap-4 border border-[#333] text-gray-400 px-8 py-4 rounded-2xl transition-all duration-300 ease-in-out
             bg-white/5
             hover:border-blue-400/60 hover:bg-[linear-gradient(90deg,rgba(96,165,250,0.40)_10%,rgba(255,255,255,0.15)_90%)] hover:text-black hover:scale-105 hover:shadow-2xl hover:shadow-blue-400/25"
>
  Learn More <MoveRight className="w-4 h-4" />
</Button>

    </Link>
          </div>
        </div>
      </div>
    </div>
  );
};