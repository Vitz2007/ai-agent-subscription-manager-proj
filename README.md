Autonomous Subscription Agentic Agent 

+Built using Node.js & Gemini 3.0+

The basic premise for this project was to toy around with agentic AI technology and one idea led to another and ended up with an AI Agent that can handle things based on an individual's request, and not be limited to specific parameters.

The AI Agent is designed to be your simple customer support rep that can look up user info, manage database, and quickly look up alternatives on the internet for customers who cancel their plan.

### AI Agent Functions

- Multi-Step Reasoning - The AI Agent thinks before giving you an answer and makes sure to ask for confirmation before taking any action.
- Persistent Memory - Able to read and write to a local JSON database. Any changes made are carried over and stick even after restarting the server.
- Real-time Web Search - If you are looking for other cheaper alternatives, the AI Agent utilizes the Serper API to retrieve real-time pricing and competitors in the area.
- Security - The AI Agent cannot execute actions such as cancellation of a subscription plan without explicit consent from user.

### What's Inside

- Core - Google Gemini 3.0 Flash via `v1beta` API for reasoning.
- Runtime - Node.js
- Knowledge - Serper.dev API for Google Seach Results.
- Memory - (fs) Local file system for persistent JSON data.
- Interface - (CLI) Command line with a persistent chat loop.

### Audit Logging System

*1. LLMs are unpredictable in its current state, so I wanted to solve the problem by giving it auditing powers. I made a custom Audit Logging System. 
- Every tool call, user input, and agent decision is structured and logged to agent_audit_log.jsonl.
- This creates an audit trail for debugging and compliance. This takes the guesswork out of what or why the AI did what it did.

*2. The endless loop of searching, getting stuck, failing, and searching over and over can happen with AI Agents.
- I decided to implement a safety protocol that puts a full-stop for the AI Agent after 5 iterations.
- End result is stopping further API expenses for the user or company.

*3. Enforce clean JSON. Gemini doesn't play along well with JSON syntax, so I added middleware to wrap any array responses into objects, essentially forcing the API hand to schema no matter what.

### How to get started

*1. Clone the repo*
```bash
git clone [https://github.com/YOUR_USERNAME/ai-agent-subscription-manager.git](https://github.com/YOUR_USERNAME/ai-agent-subscription-manager.git)
cd ai-agent-subscription-manager

### Install Dependencies
npm install @google/generative-ai dotenv

### API Keys
GEMINI_API_KEY=your_gemini_key_here
SERPER_API_KEY=your_serper_key_here

### Run the AI Agent
node --env-file=.env index.js

Let's start with this prompt - 
"Hi, I'm user_123. Look up my account details. I would like to cancel my VIP plan because it's too pricey (yes, I am sure). After that, could you find me 3 alternative streaming services in Japan under 3,000 yen?"

You'll see the AI Agent go through: Lookup, Cancel, Search, and Summarize.

### Why Agentic AI Agent
I built this to get familiar with "Function Calling" capabilities of Gemini 3.0. I believe AI holds a lot more than just generating text and can truly be an agent that interacts naturally with the user through APIs and databases to solve user's real-world problems.