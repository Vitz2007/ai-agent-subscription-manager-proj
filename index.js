// Import file system
const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Added 'readline' for dynamic input
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

/// Audit log path and constraints
const MAX_LOOPS = 5;
const AUDIT_LOG_PATH = 'agent_audit_log.jsonl';

// Load Gemini API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Integrate Personally Indentifiable Information (PII) Redaction into system
function redactPII(text) {
  if (typeof text !== 'string') return text;

  // Regex to find email addresses and phone numbers
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g; // Added basic phone support
  return text.replace(emailRegex, '[REDACTED_EMAIL]').replace(phoneRegex, '[REDACTED_PHONE]');
}

/// Conduct audit logging with redaction
function logEvent(type, content) {
  const timestamp = new Date().toISOString();
  
  // Clean data before logging and saving
  const contentString = typeof content === 'object' ? JSON.stringify(content) : content;
  const safeContent = redactPII(contentString);

  const logEntry = JSON.stringify({ timestamp, type, content: safeContent });
  
  // Append to log file
  fs.appendFileSync(AUDIT_LOG_PATH, logEntry + '\n');
}

// Insert Sentiment Engine
async function analyzeSentiment(text) {
  
  try {
    // Create a temporary model instance for classification
    const sentimentModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    
    const prompt = `Classify the sentiment of this text: "${text}". 
    Respond with ONLY one word: POSITIVE, NEUTRAL, or NEGATIVE.`;
    
    const result = await sentimentModel.generateContent(prompt);
    const sentiment = result.response.text().trim().toUpperCase();
    
    // Log the insight
    logEvent('ANALYTICS_SENTIMENT', sentiment);
    return sentiment;
  } catch (err) {
    logEvent('ANALYTICS_ERROR', 'Could not analyze sentiment');
  }
}

// Database helpers
function loadData() {
  if (!fs.existsSync('database.json')) {
    fs.writeFileSync('database.json', JSON.stringify({}));
  }
  const data = fs.readFileSync('database.json');
  return JSON.parse(data);
}

function saveData(data) {
  fs.writeFileSync('database.json', JSON.stringify(data, null, 2));
}

// Tool implementations
function getUserInfo(userId) {
  const db = loadData();

  logEvent('TOOL_EXECUTION', `getUserInfo called for ${userId}`);
  console.log(`\n[SYSTEM] Agent is getting data for: ${userId}...`);
  return db[userId] || { error: "User not found" };
}

function cancelSubscription(args) {
  const { userId, subscriptionId, confirmCancel } = args;
  logEvent('TOOL_EXECUTION', `Attempting to cancel subscription for ${userId}`);

  if (!confirmCancel) {
    logEvent('SECURITY_BLOCK', `Cancellation attempted without confirmation for ${userId}`);
    return { error: "Cancellation aborted. Confirmation required." };
  }
   
  const db = loadData(); 
  if (db[userId]) {
    db[userId].status = "Cancelled";
    saveData(db);

    logEvent('SUCCESS', `Subscription ${subscriptionId} cancelled`);
    console.log(`\n[SYSTEM] DATABASE UPDATED: ${userId} is now Cancelled.`);
    return { success: true, message: `Successfully cancelled ${subscriptionId}.` };
  }
  return { error: "User not found." };
}

async function searchWeb(args) {
  const query = args.query;
  logEvent('TOOL_EXECUTION', `Looking up web search for query: ${query}`);
  console.log(`\n[SYSTEM] Searching the web for "${query}"...`);

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query })
    });
    const data = await response.json();
    const results = data.organic ? data.organic.slice(0, 3) : [];

    logEvent('TOOL_RESULT', `Retrieved ${results.length} results`);
    return { results };
  } catch (error) {
    console.error(error);
    logEvent('ERROR', error.message);
    return { error: "Failed to connect to search engine." };
  }
}

// Tool declaration for AI model
const getUserInfoTool = {
  name: "getUserInfo",
  description: "Lookup a user's subscription plan and status by their ID.",
  parameters: {
    type: "OBJECT",
    properties: { userId: { type: "STRING", description: "The ID of the user." } },
    required: ["userId"]
  }
};

const cancelSubscriptionDeclaration = {
  name: "cancelSubscription",
  description: "Cancel a user's subscription. Requires explicit confirmation.",
  parameters: {
    type: "OBJECT",
    properties: {
      userId: { type: "STRING", description: "The ID of the user." },
      subscriptionId: { type: "STRING", description: "The ID of the plan." },
      reason: { type: "STRING", description: "The reason for cancellation." },
      confirmCancel: { type: "BOOLEAN", description: "MUST be true." }
    },
    required: ["userId", "subscriptionId", "reason", "confirmCancel"]
  }
};

const searchWebTool = {
  name: "searchWeb",
  description: "Search Google for real-time information.",
  parameters: {
    type: "OBJECT",
    properties: { query: { type: "STRING", description: "The search keywords." } },
    required: ["query"]
  }
};

// AI model initialization with tools enabled
const model = genAI.getGenerativeModel(
  { 
    model: "gemini-3-flash-preview",
    tools: [{
        functionDeclarations: [ getUserInfoTool, cancelSubscriptionDeclaration, searchWebTool ]
    }], 
  }, 
  { apiVersion: "v1beta" }
);

// Main chat loop
async function chatloop() {
  console.log("\n-- AI AGENT ONLINE (Audit Logging & Sentiment Analysis Enabled 🔴) --");
  const chat = model.startChat();
  logEvent('SYSTEM', 'AI Agent session started');

  const askQuestion = () => {
    readline.question('\nYOU: ', async (userInput) => {
      if (userInput.toLowerCase() === 'exit') {
        logEvent('SYSTEM', 'User exited the session');
        readline.close();
        return;
      }

      try {
        logEvent('USER_INPUT', userInput);
        
        // Analyze sentiment of user input
        analyzeSentiment(userInput); 

        let result = await chat.sendMessage(userInput);
        let response = result.response;
        let call = response.functionCalls()?.[0];

        let loopCount = 0;

        while (call) {
          if (loopCount >= MAX_LOOPS) {
            console.log("🚨 EMERGENCY STOP: Maximum execution loops reached.");
            logEvent('CRITICAL', 'Maximum execution loops reached.');
            break;
          }
          loopCount++;
          
          const toolName = call.name;
          const toolArgs = call.args;
          let toolResult;

          if (toolName === "getUserInfo") toolResult = getUserInfo(toolArgs.userId);
          if (toolName === "cancelSubscription") toolResult = cancelSubscription(toolArgs);
          if (toolName === "searchWeb") toolResult = await searchWeb(toolArgs);

          const finalResult = await chat.sendMessage([{
            functionResponse: { name: toolName, response: toolResult }
          }]);
          
          response = finalResult.response;
          call = response.functionCalls()?.[0];
        }
        console.log("AGENT:", response.text());
        logEvent('AGENT_RESPONSE', response.text());

      } catch (err) {
        console.error("Error:", err.message);
        logEvent('ERROR', err.message);
      }
      askQuestion();
    } );
  };
  askQuestion();
}
chatloop();