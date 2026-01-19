// Import file system manager
const fs = require('fs')

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { type } = require('os');

// Add 'readline' to have dynamic input
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

/// Restrict searches for safety
const MAX_LOOPS = 5;
const AUDIT_LOG_PATH = 'agent_audit_log.jsonl';

/// Detect and redact personally identifiable information (PII)
function redactPII(text) {
  if (typeof text !== 'string') return text;
  // Simplified PII redaction of emails and phone numbers
  const emailRegex = /[a-zA-Z0-9,._%+-]+@[a-zA-Z0-9,.-]+\.[a-zA-Z]{2,}/g;
const phoneRegex = /\b\d{3}[-,.\s]??\d{3}[-,\s.]??\d{4}\b/g;
return text.replace(emailRegex, '[REDACTED EMAIL]').replace(phoneRegex, '[REDACTED PHONE]');
}

/// Audit Logging of decisions, actions, changes, and results to file
function logEvent (type, content) {
  const timestamp = new Date().toISOString();

  /// Cleaning data for PII before saving
  // If content is an object, turn to string for redaction
  const contentString = typeof content === 'object' ? JSON.stringify(content) : content;
  const safeContent = redactPII(contentString);

  const logEntry = JSON.stringify({ timestamp, type, content: safeContent });

// Append to log file
fs.appendFileSync(AUDIT_LOG_PATH, logEntry + '\n');
}

// Javascript tools updated to load data from file
function loadData() {
  if (!fs.existsSync('database.json')) {
    // Create file if it ddoesn't exist
    fs.writeFileSync('database.json', JSON.stringify({}))  }
  const data = fs.readFileSync('database.json');
  return JSON.parse(data);
}

// Call function to save data
function saveData(data) {
fs.writeFileSync('database.json', JSON.stringify(data, null, 2));
}

// Update getUserInfo to get data from file
function getUserInfo(userId) {
  const db = loadData();
  console.log(`\n[SYSTEM] Agent is getting data for: ${userId}...`);
  return db[userId] || { error: "User not found" };
}

function cancelSubscription(args) {
  const { userId, subscriptionId, reason, confirmCancel } = args;
  logEvent('TOOL EXECUTION', 'Attempting to cancel subscription for  ${userId}');

  if (!confirmCancel) {
    logEvent('SECURITY BLOCK', 'Cancellation attempted without confirmation for ${userId}');
    return { error: "Cancellation aborted. Confirmation required." };
  }

  const db = loadData(); 
   if (db[userId]) {
    db[userId].status = "Cancelled";
    saveData(db);
    logEvent('SUCCESS', 'Subscription ${subscriptionId} cancelled');

   console.log(`\n[SYSTEM] DATABASE UPDATED: ${userId} is now Cancelled.`);

  return { success: true, message: `Successfully cancelled ${subscriptionId}.` };
}
  return { error: "User not found." };
}

// Add search functionality 
async function searchWeb(args) {
  const query = args.query;
  logEvent('TOOL EXECUTION', `Looking up web search for query: ${query}`);
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

// Resturn top 3 results to narrow down info and keep AI focused
const results = data.organic ? data.organic.slice(0, 3) : [];
logEvent('TOOL RESULT', `Retrieved ${results.length} results`);
return { results };
  } catch (error) {
    console.error(error);
    return { error: "Failed to connect to search engine." };
  }
}

// Schemas
const getUserInfoTool = {
  name: "getUserInfo",
  description: "Lookup a user's subscription plan and status by their ID.",
  parameters: {
    type: "OBJECT",
    properties: {
      userId: { type: "STRING", description: "The ID of the user, e.g., 'user_123'." }
    },
    required: ["userId"]
  }
};

const cancelSubscriptionDeclaration = {
  name: "cancelSubscription",
  description: "Cancel a user's subscription. Requires explicit confirmation from the user.",
  parameters: {
    type: "OBJECT",
    properties: {
      userId: { type: "STRING", description: "The ID of the user." },
      subscriptionId: { type: "STRING", description: "The ID of the plan to cancel." },
      reason: { type: "STRING", description: "The reason for cancellation." },
      confirmCancel: { type: "BOOLEAN", description: "MUST be true to execute cancellation." }
    },
    required: ["userId", "subscriptionId", "reason", "confirmCancel"]
  }
};

//Add search schema
const searchWebTool = {
  name: "searchWeb",
  description: "Search Google for information in real-time on competitors or news.",
parameters: {
  type: "OBJECT",
  properties: {
    query: { type: "STRING", description: "The search keywords or phrases."}
  },
  required: ["query"]
  }
};

// Tap into Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel(
  { 
    model: "gemini-3-flash-preview",
    tools: [{
        functionDeclarations: [ getUserInfoTool, cancelSubscriptionDeclaration, searchWebTool ]
    }], // Add searchWebTool here
  }, 
  { apiVersion: "v1beta" }
);

// Update main loop to chatbot framework for user conversations
async function chatloop() {
  console.log("\n-- AI AGENT ONLINE (Audit Logging Enabled. Type 'exit' to quit session) --");
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
        logEvent('USER INPUT', userInput);
        let result = await chat.sendMessage(userInput);
        let response = result.response;
        let call = response.functionCalls()?.[0];

        // Limit loops to avoid infiinite cycles
        let loopCount = 0;

        while (call) {
          if (loopCount >= MAX_LOOPS) {
            console.log("EMERGENCY STOP: Maximum execution loops reached.");
          logEvent('Critical', 'Maximum execution loops reached, stop further actions stopped.');
          break;
          }
          loopCount++;
          
          const toolName = call.name;
          const toolArgs = call.args;
          let toolResult;

          if (toolName === "getUserInfo") toolResult = getUserInfo(toolArgs.userId);
          if (toolName === "cancelSubscription") toolResult = cancelSubscription(toolArgs);

          // Logic for searchWeb
          if (toolName === "searchWeb") toolResult = await searchWeb(toolArgs);

          const finalResult = await chat.sendMessage([{
            functionResponse: { name: toolName, response: toolResult }
          }]);
          
          response = finalResult.response;
          call = response.functionCalls()?.[0];
        }
        console.log("AGENT:", response.text());
      } catch (err) {
        console.error("Error:", err.message);
      }
      askQuestion();
    } );
  };
  askQuestion();
}
chatloop();