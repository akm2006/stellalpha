"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Toast, ToastContainer } from "@/components/toast"

export function ToastDemo() {
  const [toasts, setToasts] = useState<
    Array<{ id: number; variant: "success" | "error" | "loading"; title: string; description: string }>
  >([])

  const addToast = (variant: "success" | "error" | "loading", title: string, description: string) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, variant, title, description }])

    // Auto remove after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 5000)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => addToast("success", "Trade Executed", "Successfully bought 500 $PEPE")}
          className="bg-green-600 hover:bg-green-700"
        >
          Show Success Toast
        </Button>
        <Button
          onClick={() => addToast("error", "Transaction Failed", "Insufficient funds in Smart Account")}
          className="bg-red-600 hover:bg-red-700"
        >
          Show Error Toast
        </Button>
        <Button
          onClick={() => addToast("loading", "Processing Transaction...", "Please wait for confirmation")}
          className="electric-cyan-bg text-black hover:opacity-80"
        >
          Show Loading Toast
        </Button>
      </div>

      <ToastContainer>
        {toasts.map((toast) => (
          <Toast key={toast.id} variant={toast.variant} title={toast.title} description={toast.description} />
        ))}
      </ToastContainer>
    </div>
  )
}
