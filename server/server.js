/* 
   server.js
   =========
   Node.js backend server to handle requests to XAI Grok API.
   Enhanced with conversation support.
*/

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Check for required environment variable
if (!process.env.XAI_API_KEY) {
    console.warn('Warning: XAI_API_KEY environment variable is not set.');
}

// Store conversations in memory (you might want to use a proper database in production)
const conversations = new Map();

// Grok API integration
const grokClient = axios.create({
    baseURL: 'https://api.x.ai/v1',
    headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

// Helper function to create conversation ID
const createConversationId = (tabId) => `conv_${tabId}_${Date.now()}`;

// Initialize a new conversation with summary
app.post('/api/conversation/init', async (req, res) => {
    const { tabId, pageContent } = req.body;
    
    if (!tabId || !pageContent) {
        return res.status(400).json({ error: 'Missing required parameters.' });
    }

    try {
        const response = await grokClient.post('/chat/completions', {
            model: "grok-beta",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that first creates a clear, concise summary of the content, and then can engage in detailed follow-up discussions about it. Keep the initial summary focused on the main points and key insights."
                },
                {
                    role: "user",
                    content: `Please provide a clear summary of this content:\n\n${pageContent}`
                }
            ],
            max_tokens: 500
        });

        if (response.data?.choices?.[0]) {
            const conversationId = createConversationId(tabId);
            const summary = response.data.choices[0].message.content;
            
            // Store conversation context
            conversations.set(conversationId, {
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that provides detailed answers about the content being discussed. Reference specific details from the content when relevant."
                    },
                    {
                        role: "user",
                        content: `Here's the content we're discussing:\n\n${pageContent}\n\nI provided this summary: ${summary}`
                    },
                    {
                        role: "assistant",
                        content: "I understand the content and summary. I'm ready to discuss any specific aspects or answer questions about it."
                    }
                ],
                pageContent: pageContent,
                summary: summary
            });

            return res.json({ 
                success: true,
                summary,
                conversationId
            });
        } else {
            throw new Error('Unexpected API response structure');
        }
    } catch (err) {
        console.error('Error calling Grok API:', err.response ? err.response.data : err.message);
        return res.status(500).json({ 
            error: 'Failed to retrieve summary from Grok API.',
            details: err.response ? err.response.data : err.message
        });
    }
});

// Handle chat messages
app.post('/api/conversation/chat', async (req, res) => {
    const { conversationId, message } = req.body;
    
    if (!conversationId || !message) {
        return res.status(400).json({ error: 'Missing required parameters.' });
    }

    const conversation = conversations.get(conversationId);
    if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found.' });
    }

    try {
        // Add user message to conversation history
        conversation.messages.push({
            role: "user",
            content: message
        });

        // Get response from Grok
        const response = await grokClient.post('/chat/completions', {
            model: "grok-beta",
            messages: conversation.messages,
            max_tokens: 500
        });

        if (response.data?.choices?.[0]) {
            const reply = response.data.choices[0].message.content;
            
            // Add assistant's reply to conversation history
            conversation.messages.push({
                role: "assistant",
                content: reply
            });

            // Update conversation in memory
            conversations.set(conversationId, conversation);

            return res.json({ 
                success: true,
                reply
            });
        } else {
            throw new Error('Unexpected API response structure');
        }
    } catch (err) {
        console.error('Error calling Grok API:', err.response ? err.response.data : err.message);
        return res.status(500).json({ 
            error: 'Failed to get response from Grok API.',
            details: err.response ? err.response.data : err.message
        });
    }
});

// Clean up old conversations periodically (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [id] of conversations) {
        const timestamp = parseInt(id.split('_')[2]);
        if (timestamp < oneHourAgo) {
            conversations.delete(id);
        }
    }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`XAI Chat backend running on http://localhost:${PORT}`);
    console.log('API Key present:', !!process.env.XAI_API_KEY);
});