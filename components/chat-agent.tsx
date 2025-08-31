"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/toast';
import { Bot, X, Send, User, Loader2, AlertTriangle, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

// Define the structure of a chat message
interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
}

export function ChatAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasEnteredKey, setHasEnteredKey] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { isConnected, connectedWallet } = useWallet();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom of the chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset state when wallet is disconnected
  useEffect(() => {
    if (!isConnected) {
      setIsOpen(false);
      setHasEnteredKey(false);
      setPrivateKey('');
      setMessages([]);
    }
  }, [isConnected]);
  
  const handleKeySubmit = () => {
    if (!privateKey) {
      showToast("Please enter your private key.", "error");
      return;
    }
    setHasEnteredKey(true);
    showToast("Private key accepted for this session.", "success");
    // Add an initial message from the assistant
    setMessages([{
        id: 'initial-assistant-message',
        role: 'assistant',
        content: "Hello! I am your on-chain AI assistant, ready to assist with your wallet operations. How can I help you today?"
    }]);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !privateKey) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    let fullResponse = '';
    const assistantMessageId = (Date.now() + 1).toString();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [...messages, userMessage],
                data: { privateKey: privateKey.startsWith('0x') ? privateKey : `0x${privateKey}` }
            })
        });

        if (!response.ok || !response.body) {
            throw new Error(`API error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        // Add a placeholder for the streaming response
        setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '...' }]);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
                try {
                    const parsedChunk = JSON.parse(line);
                    if (parsedChunk?.agent?.messages?.[0]?.kwargs?.content) {
                        fullResponse += parsedChunk.agent.messages[0].kwargs.content;
                    } else if (parsedChunk?.tools?.messages?.[0]?.kwargs?.content) {
                        const toolOutput = parsedChunk.tools.messages[0].kwargs.content;
                        fullResponse += `\n\n**Tool Result:**\n\`\`\`\n${toolOutput}\n\`\`\`\n`;
                    }
                    
                    setMessages(prev => prev.map(msg => 
                        msg.id === assistantMessageId ? { ...msg, content: fullResponse + "▋" } : msg
                    ));

                } catch (error) {
                    console.error("Error parsing stream chunk:", line, error);
                }
            }
        }
        // Final update to remove the cursor
        setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: fullResponse } : msg
        ));

    } catch (err: any) {
      const errorMessage: Message = {
        id: assistantMessageId,
        role: 'system',
        content: `Error: ${err.message}`
      };
      setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? errorMessage : msg));
    } finally {
        setIsLoading(false);
    }
  };


  const renderChatContent = () => {
    if (!isConnected) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <Wallet className="w-12 h-12 mb-4 electric-cyan" />
          <h3 className="text-xl font-bold text-white mb-2">Wallet Not Connected</h3>
          <p className="text-gray-400">Please connect your MetaMask wallet to use the AI Agent.</p>
        </div>
      );
    }

    if (!hasEnteredKey) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Private Key Required</h3>
          <p className="text-gray-400 max-w-md mb-4">
            To allow the AI agent to perform actions on your behalf, please provide the private key for your connected wallet. This key is sent securely to the backend and is not stored.
          </p>
           <p className="text-xs text-red-400 mb-6 max-w-md">
            Warning: For demonstration purposes only. Always use a burner wallet and never expose the private key of a wallet containing real funds.
          </p>
          <div className="w-full max-w-sm flex gap-2">
            <Input
              type="password"
              placeholder="Enter Private Key..."
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="glass-input flex-1 text-white"
            />
            <Button onClick={handleKeySubmit} className="electric-cyan-bg text-black font-bold">Submit</Button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
              <div className="text-center text-gray-400 p-8">
                <Bot className="w-12 h-12 mx-auto mb-4"/>
                <p>Hello! I'm your on-chain AI assistant. Ask me to check balances, transfer tokens, and more.</p>
              </div>
          )}
          {messages.map((m: Message) => (
            <div key={m.id} className={cn("flex gap-4 animate-in fade-in duration-500", m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role !== 'user' && <Bot className="w-6 h-6 flex-shrink-0 electric-cyan mt-1" />}
              <div className={cn(
                "max-w-xl p-4 rounded-xl whitespace-pre-wrap break-words", // Added break-words
                m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'glass-card bg-white/5 text-white rounded-bl-none',
                m.role === 'system' && 'bg-red-900/50 border border-red-500/50'
              )}>
                {m.content}
              </div>
              {m.role === 'user' && <User className="w-6 h-6 flex-shrink-0 text-white mt-1" />}
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
             <div className="flex gap-4 justify-start animate-in fade-in duration-500">
                <Bot className="w-6 h-6 flex-shrink-0 electric-cyan mt-1" />
                <div className="max-w-xl p-4 rounded-xl glass-card bg-white/5 text-white rounded-bl-none">
                    <Loader2 className="w-5 h-5 animate-spin"/>
                </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSubmit} className="p-4 border-t border-white/10">
          <div className="relative">
            <Input
              value={input}
              placeholder="Ask me to swap 0.01 AVAX for USDC..."
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="glass-input pr-12 h-12 text-white"
            />
            <Button type="submit" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 electric-cyan-bg text-black" disabled={isLoading || !input}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </form>
      </>
    );
  };
  

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
  onClick={() => setIsOpen(true)}
  className={cn(
    "group fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full text-gray-200 shadow-lg hover:shadow-xl animate-float transition-all duration-300 ease-in-out",
    "border border-[#333] bg-cyan-400/20", // base: faint cyan + dark border
    "hover:w-[220px]",
    "hover:border-cyan-400/60 hover:bg-[linear-gradient(90deg,rgba(0,246,255,0.70)_10%,rgba(255,255,255,0.20)_90%)] hover:text-white"
  )}
>
  <div className="flex items-center justify-center space-x-2 size-full">
    {/* Bot Icon */}
    <Bot className="w-8 h-8 flex-shrink-0" />
    {/* Text appears on hover */}
    <span className="font-bold text-sm overflow-hidden whitespace-nowrap w-0 opacity-0 transition-all duration-300 ease-in-out group-hover:w-auto group-hover:opacity-100">
      Stellalpha AI Agent
    </span>
  </div>
</button>

      )}

      {/* Full-screen Chat Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="glass-card w-[90vw] h-[90vh] max-w-4xl rounded-2xl flex flex-col shadow-2xl">
            <header className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Bot className="w-6 h-6 electric-cyan" />
                <h2 className="text-xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">Stellalpha AI Agent</h2>
              </div>
              <Button onClick={() => setIsOpen(false)} variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <X className="w-5 h-5" />
              </Button>
            </header>
            {renderChatContent()}
          </div>
        </div>
      )}
    </>
  );
}

