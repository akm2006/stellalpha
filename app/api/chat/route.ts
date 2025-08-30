// In app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Agentkit, AgentkitToolkit } from '@0xgasless/agentkit';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import 'server-only'; // This is a server-only file

async function createAgent(privateKey: `0x${string}`) {
  // 1. Initialize the Language Model (LLM) with fixes
  const llm = new ChatOpenAI({
    model: 'gpt-4o',
    // FIX 1: The correct property name is 'apiKey'
    apiKey: process.env.OPENROUTER_API_KEY, 
    // FIX 2: Set a max token limit to stay within the free tier
    maxTokens: 2048, 
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
    },
    streaming: true,
  });

  // 2. Set environment variables for the AgentKit tools
  process.env['USE_EOA'] = 'true';
  process.env['PRIVATE_KEY'] = privateKey;
  process.env['RPC_URL'] = process.env.AVALANCHE_RPC_URL as string;
  process.env['CHAIN_ID'] = process.env.CHAIN_ID as string;
  process.env['0xGASLESS_API_KEY'] = process.env.OXGASLESS_API_KEY as string;

  // 3. Configure Agentkit with the user's EOA
  const agentkit = await Agentkit.configureWithWallet({
    privateKey,
    rpcUrl: process.env.AVALANCHE_RPC_URL!,
    apiKey: process.env.OXGASLESS_API_KEY!,
    chainID: Number(process.env.CHAIN_ID!)
  });

  // 4. Create the toolkit and get the tools using the correct class
  const toolkit = new AgentkitToolkit(agentkit);
  const tools = toolkit.getTools();
  console.log(`[Chat API] Loaded ${tools.length} tools for the agent.`);

  // 5. Create the LangChain Agent
  const agent = createReactAgent({
    llm,
    tools,
  });

  return agent;
}

// This is the main API handler
export async function POST(request: NextRequest) {
  try {
    const { messages, data } = await request.json();
    const privateKey = data?.privateKey;

    if (!messages || !privateKey) {
      return NextResponse.json(
        { error: 'Messages and privateKey are required' },
        { status: 400 },
      );
    }

    // Create the agent instance for this conversation
    const agent = await createAgent(privateKey);

    // Start the agent with the user's message history
    const stream = await agent.stream({ messages });

    // Manually create a ReadableStream to send back to the client
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of stream) {
                    // Each chunk from the agent is a JSON object. We stringify it and send it as a line.
                    controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
                }
                controller.close();
            } catch (error) {
                console.error('Error during agent stream:', error);
                const errorPayload = { error: error instanceof Error ? error.message : 'Unknown streaming error' };
                controller.enqueue(encoder.encode(`${JSON.stringify(errorPayload)}\n`));
                controller.close();
            }
        }
    });
    
    // Return a raw Response object with our manual stream
    return new Response(readableStream, {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Transfer-Encoding': 'chunked',
        }
    });
    
  } catch (error: any) {
    console.error('[Chat API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}