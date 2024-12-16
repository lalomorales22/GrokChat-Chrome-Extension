/* 
   popup.js
   ========
   Enhanced with chat functionality
*/

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    const spinner = document.getElementById('spinner');
    const messageEl = document.getElementById('message');
    const summaryEl = document.getElementById('summary');
    const errorEl = document.getElementById('error');
    const chatContainer = document.getElementById('chatContainer');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendMessage');
    
    let currentConversationId = null;
  
    const startLoading = () => {
        spinner.classList.remove('hidden');
        messageEl.classList.add('hidden');
        summaryEl.classList.add('hidden');
        errorEl.classList.add('hidden');
        chatContainer.classList.add('hidden');
    };
  
    const stopLoading = () => {
        spinner.classList.add('hidden');
    };
  
    const showError = (message) => {
        errorEl.textContent = 'Error: ' + message;
        errorEl.classList.remove('hidden');
    };

    const appendMessage = (content, isUser = false) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isUser ? 'user' : 'bot'}`;
        messageDiv.textContent = content;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    // Auto-resize textarea as user types
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    });

    // Handle enter key in textarea
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (chatInput.value.trim()) {
                sendMessage();
            }
        }
    });

    const sendMessage = async () => {
        const message = chatInput.value.trim();
        if (!message || !currentConversationId) return;

        // Clear input and reset height
        chatInput.value = '';
        chatInput.style.height = 'auto';
        
        // Disable input and button while processing
        chatInput.disabled = true;
        sendButton.disabled = true;
        
        // Show user message
        appendMessage(message, true);

        try {
            chrome.runtime.sendMessage(
                { 
                    type: 'chat',
                    message,
                    conversationId: currentConversationId
                },
                (response) => {
                    chatInput.disabled = false;
                    sendButton.disabled = false;
                    chatInput.focus();

                    if (chrome.runtime.lastError) {
                        showError(chrome.runtime.lastError.message);
                        return;
                    }
                    
                    if (response && response.success) {
                        appendMessage(response.reply);
                    } else {
                        showError(response?.error || 'Failed to get response');
                    }
                }
            );
        } catch (err) {
            chatInput.disabled = false;
            sendButton.disabled = false;
            showError(err.message);
        }
    };

    sendButton.addEventListener('click', sendMessage);
  
    const summarizePage = async () => {
        startLoading();
        try {
            // Get active tab
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            // Get page text from content script
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    return document.body.innerText;
                }
            });
            
            const pageText = results[0].result;
            
            if (!pageText) {
                throw new Error('No text found on page');
            }
            
            // Clear previous chat messages when getting new summary
            chatMessages.innerHTML = '';
            
            // Send to background script for summarization
            chrome.runtime.sendMessage(
                { type: 'summarize', text: pageText },
                (response) => {
                    stopLoading();
                    if (chrome.runtime.lastError) {
                        showError(chrome.runtime.lastError.message);
                        return;
                    }
                    
                    if (response && response.success) {
                        summaryEl.textContent = response.summary;
                        summaryEl.classList.remove('hidden');
                        currentConversationId = response.conversationId;
                        chatContainer.classList.remove('hidden');
                        
                        // Add initial message to chat
                        appendMessage("I've provided a summary above. Feel free to ask any questions about the content!");
                        
                        chatInput.focus();
                    } else {
                        showError(response?.error || 'Unknown error occurred');
                    }
                }
            );
        } catch (err) {
            stopLoading();
            showError(err.message);
        }
    };
  
    refreshBtn.addEventListener('click', summarizePage);
});