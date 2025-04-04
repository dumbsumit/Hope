import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import { VertexAI } from "@google-cloud/vertexai";
import { GoogleAuth } from "google-auth-library";

dotenv.config();

// Google Vertex AI initialization
let vertexAI = null;

async function initializeVertexAI() {
  try {
    const auth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
    const client = await auth.getClient();
    console.log("Authenticated with project:", client.projectId);

    vertexAI = new VertexAI({
      project: "hope-455612",
      location: "us-central1",
    });

    console.log("VertexAI initialized successfully");
  } catch (err) {
    console.error("VertexAI initialization failed:", err);
    process.exit(1); // Exit the process if initialization fails
  }
}

// Initialize VertexAI before starting the server
await initializeVertexAI(); // Ensure this runs before requests are handled

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-", // Ensure API key is set
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "cgSgspJ2msm6clMCkdW9";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

// Execute shell command
const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

// Generate lip sync animation
// const lipSyncMessage = async (message) => {
//   const time = new Date().getTime();
//   console.log(`Starting conversion for message ${message}`);
//   await execCommand(
//     `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
//   );
//   console.log(`Conversion done in ${new Date().getTime() - time}ms`);
//   await execCommand(
//     `rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
//   );
  
//   console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
// };
const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
  );
  
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  
  try {
    // await execCommand(
    //   `rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic --extendedShapes`
    // );
    await execCommand(
      `rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic --extendedShapes --dialogFile=audios/message_${message}.txt`
    );
    
    console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
  } catch (error) {
    console.error(`⚠️ Lip sync failed for message ${message}. Using fallback animation.`);
    // Generate empty lip sync data as fallback
    await fs.writeFile(
      `audios/message_${message}.json`,
      JSON.stringify([{ time: 0, value: "X" }])
    );
  }
};

// Chat endpoint
app.post("/chat", async (req, res) => {
  if (!vertexAI) {
    return res.status(500).send({
      error: "VertexAI not initialized - check authentication",
    });
  }

  const userMessage = req.body.message;
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }

  if (!elevenLabsApiKey || openai.apiKey === "-") {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
      ],
    });
    return;
  }

  const textModel = "gemini-1.5-flash";

  const generativeModelPreview = vertexAI.preview.getGenerativeModel({
    model: textModel,
    systemInstruction: {
      role: "system",
      parts: [
        {
          text: `You are a virtual therapy bot designed to provide emotional support and advice to women. 
          Your goal is to listen empathetically and offer thoughtful, comforting advice. 
          ⚠️ IMPORTANT: ALWAYS respond in the following JSON format: 
  
          \`\`\`json
          [
            {
              "text": "Your message here",
              "facialExpression": "smile",
              "animation": "Talking_1"
            }
          ]
          \`\`\`
  
          DO NOT return plain text responses. Always wrap responses inside a JSON array.`
        },
      ],
    },
  });
  

  const request = {
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage || "Hello" }],
      },
    ],
  };

  try {
    const result = await generativeModelPreview.generateContent(request);
    console.log("Full response: ", JSON.stringify(result));

    const candidate = result?.response?.candidates?.[0];
    const parts = candidate?.content?.parts;

    if (!parts || !parts[0]?.text) {
      throw new Error("Unexpected response structure from Google Gemini API.");
    }

    let messages;
    try {
      const jsonResponse = parts[0].text;
      const cleanJsonString = jsonResponse
        .replace(/^```json\s*\n/, "")
        .replace(/\n```$/, "");

      messages = JSON.parse(cleanJsonString);
      console.log("Parsed JSON response:", messages);
    } catch (error) {
      throw new Error("Error parsing response from Google Gemini API.");
    }

    if (messages.messages) {
      messages = messages.messages;
    }
    // for (let i = 0; i < messages.length; i++) {
    //   const message = messages[i];
    //   const fileName = `audios/message_${i}.mp3`;
    //   await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, message.text);
    //   await lipSyncMessage(i);
    //   message.audio = await audioFileToBase64(fileName);
    //   message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
    // }
    for (let i = 0; i < messages.length; i++) {
      try {
        const message = messages[i];
        const fileName = `audios/message_${i}.mp3`;
        
        // Generate audio
        await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, message.text);
        
        // Generate lipsync (with built-in error handling)
        await lipSyncMessage(i);
        
        // Add results to message
        message.audio = await audioFileToBase64(fileName);
        message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
        
      } catch (error) {
        console.error(`⚠️ Failed to process message ${i}:`, error.message);
        
        // Add fallback animation
        const lipSyncData = await readJsonTranscript(`audios/message_${i}.json`);
        messages[i].lipsync = lipSyncData.length > 0 ? lipSyncData : [{ time: 0, value: "X" }];
        
        
        // Mark as partial failure
        messages[i].processingWarning = "Lip sync generation failed";
      }
    }

    res.send({ messages });
  } catch (error) {
    console.error("Error handling /chat request:", error);
    res.status(500).send({ error: error.message });
  }
});

// Read JSON transcript
const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

// Convert audio file to base64
const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

// Start server
app.listen(port, () => {
  console.log(`Virtual Girlfriend listening on port ${port}`);
});
