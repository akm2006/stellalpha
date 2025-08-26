"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Check, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToastProps {
  variant: "success" | "error" | "loading"
  title: string
  description: string
  className?: string
}

export function Toast({ variant, title, description, className }: ToastProps) {
  const getIcon = () => {
    switch (variant) {
      case "success":
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
        )
      case "error":
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
            <X className="w-4 h-4 text-white" />
          </div>
        )
      case "loading":
        return (
          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-[#00f6ff] animate-spin" />
          </div>
        )
    }
  }

  return (
    <div className={cn("glassmorphism-card rounded-lg p-4 flex items-start gap-3 min-w-[320px] max-w-md", className)}>
      {getIcon()}
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-white text-sm leading-tight">{title}</h4>
        <p className="text-gray-400 text-xs mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// Individual toast components for easier usage
export function SuccessToast({ title, description, className }: Omit<ToastProps, "variant">) {
  return <Toast variant="success" title={title} description={description} className={className} />
}

export function ErrorToast({ title, description, className }: Omit<ToastProps, "variant">) {
  return <Toast variant="error" title={title} description={description} className={className} />
}

export function LoadingToast({ title, description, className }: Omit<ToastProps, "variant">) {
  return <Toast variant="loading" title={title} description={description} className={className} />
}

// Toast container for positioning multiple toasts
export function ToastContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2", className)}>
      {children}
    </div>
  )
}

interface ToastItem {
  id: string
  message: string
  variant: "success" | "error" | "loading"
}

let toastListeners: ((toasts: ToastItem[]) => void)[] = []
let toasts: ToastItem[] = []

export const showToast = (
  message: string, 
  type: 'success' | 'error' | 'loading', 
  toastId?: string
): string => {
  // Generate a new ID if none provided
  const id = toastId || Math.random().toString(36).substr(2, 9);
  
  // Remove existing toast if ID provided
  if (toastId) {
    toasts = toasts.filter(t => t.id !== toastId);
  }
  
  // Add new toast
  const newToast: ToastItem = {
    id,
    message,
    variant: type
  };
  
  toasts = [...toasts, newToast];
  
  // Notify listeners
  toastListeners.forEach(listener => listener(toasts));
  
  // Auto-remove non-loading toasts
  if (type !== 'loading') {
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      toastListeners.forEach(listener => listener(toasts));
    }, 3000);
  }
  
  return id;
}

export function useToasts() {
  const [currentToasts, setCurrentToasts] = useState<ToastItem[]>(toasts)

  useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setCurrentToasts(newToasts)
    toastListeners.push(listener)

    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener)
    }
  }, [])

  return currentToasts
}

export function GlobalToastRenderer() {
  const currentToasts = useToasts()

  return (
    <ToastContainer>
      {currentToasts.map((toast) => (
        <Toast key={toast.id} variant={toast.variant} title={toast.message} description="" />
      ))}
    </ToastContainer>
  )
}
