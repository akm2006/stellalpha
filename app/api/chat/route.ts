// In app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Agentkit, LangchainAgentkitToolkit } from '@0xgasless/agentkit';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { StreamingTextResponse } from 'ai';
import { toDataStream } from '@ai-sdk/langchain';
// This is a server-only file
import 'server-only';

async function createAgent(privateKey: `0x${string}`) {
  // 1. Initialize the Language Model (LLM)
  const llm = new ChatOpenAI({
    model: 'gpt-4o',
    openAIApiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
    },
    streaming: true,
  });

  // 2. Set environment variables for the AgentKit tools
  process.env['USE_EOA'] = 'true';
  process.env['PRIVATE_KEY'] = privateKey;
  process.env['RPC_URL'] = process.env.AVALANCHE_RPC_URL as string;
  process.env['CHAIN_ID'] = '43113'; // Fuji Testnet
  process.env['0xGASLESS_API_KEY'] = process.env.OXGASLESS_API_KEY as string;

  // 3. Configure Agentkit with the user's EOA
  const agentkit = await Agentkit.configureWithWallet({
    privateKey,
    rpcUrl: process.env.AVALANCHE_RPC_URL!,
    apiKey: process.env.OXGASLESS_API_KEY!,
    chainID: 43113, // Fuji Testnet
  });

  // 4. Create the toolkit and get the tools
  const toolkit = new LangchainAgentkitToolkit(agentkit);
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
    const currentMessage = messages[messages.length - 1];

    if (!currentMessage || !privateKey) {
      return NextResponse.json(
        { error: 'Message and privateKey are required' },
        { status: 400 },
      );
    }

    // Create the agent instance for this conversation
    const agent = await createAgent(privateKey);

    // Start the agent with the user's message history
    const stream = await agent.stream({ messages });

    // Convert the LangChain/LangGraph stream to a Vercel AI SDK compatible stream
    const aiStream = toDataStream(stream);

    // Respond with the stream
    return new StreamingTextResponse(aiStream);
  } catch (error: any) {
    console.error('[Chat API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
