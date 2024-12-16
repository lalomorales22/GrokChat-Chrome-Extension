/* background.js
   ============= 
   Handles communication with local backend and manages conversations
*/

// Store active conversations
const activeConversations = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'summarize') {
        const { text } = request;
        
        // Get the current tab ID
        chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
            const tabId = tabs[0].id;
            
            try {
                const response = await fetch('http://localhost:3000/api/conversation/init', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        tabId: tabId,
                        pageContent: text 
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Server error (${response.status}): ${errorText}`);
                }

                const data = await response.json();
                
                if (data.error) {
                    sendResponse({ success: false, error: data.error });
                } else {
                    // Store conversation ID for this tab
                    activeConversations.set(tabId, data.conversationId);
                    
                    sendResponse({ 
                        success: true, 
                        summary: data.summary,
                        conversationId: data.conversationId
                    });
                }
            } catch (err) {
                console.error('Error fetching summary:', err);
                sendResponse({ 
                    success: false, 
                    error: err.message || 'Failed to get summary'
                });
            }
        });
        
        return true;  // Will respond asynchronously
    }
    
    else if (request.type === 'chat') {
        const { message, conversationId } = request;
        
        fetch('http://localhost:3000/api/conversation/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ conversationId, message })
        })
        .then(async res => {
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Server error (${res.status}): ${errorText}`);
            }
            return res.json();
        })
        .then(data => {
            if (data.error) {
                sendResponse({ success: false, error: data.error });
            } else {
                sendResponse({ success: true, reply: data.reply });
            }
        })
        .catch(err => {
            console.error('Error in chat:', err);
            sendResponse({ 
                success: false, 
                error: err.message || 'Failed to get response'
            });
        });
        
        return true;  // Will respond asynchronously
    }
});