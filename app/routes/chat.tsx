import { useEffect, useState, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Route } from './+types/chat';

// Y-Sweet connection URL
const YSWEET_URL = 'yss://AAAgJEFOel7C0OSObVKe43VnZ7L5GDYmlwHYuz5Xc1fqGJk@bn-colllab-b7cabsc0dufucpdk.eastus2-01.azurewebsites.net';

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  color: string;
  replyTo?: string; // ID of the message this is replying to
}

interface User {
  name: string;
  color: string;
  typing: string;
  lastSeen: number;
  cursorX?: number;
  cursorY?: number;
}

// Generate random color for user
const generateColor = () => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', 
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Generate random username
const generateUsername = () => {
  const adjectives = ['Happy', 'Clever', 'Swift', 'Brave', 'Bright', 'Cool', 'Calm', 'Bold'];
  const nouns = ['Panda', 'Tiger', 'Eagle', 'Fox', 'Wolf', 'Bear', 'Lion', 'Hawk'];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Collaborative Chat' },
    { name: 'description', content: 'Real-time collaborative chat with Yjs' },
  ];
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [activeUsers, setActiveUsers] = useState<Map<string, User>>(new Map());
  const [cursors, setCursors] = useState<Map<string, User>>(new Map());
  const [currentUser] = useState(() => ({
    name: generateUsername(),
    color: generateColor(),
    id: Math.random().toString(36).substring(7),
  }));
  
  // AI Assistant as a user
  const aiUser = {
    name: '🤖 AI Assistant',
    color: '#9b59b6',
    id: 'ai-assistant',
  };

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const messagesArrayRef = useRef<Y.Array<any> | null>(null);
  const usersMapRef = useRef<Y.Map<any> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Parse Y-Sweet URL
    const url = YSWEET_URL.replace('yss://', 'wss://');
    const [authPart, hostPart] = url.replace('wss://', '').split('@');
    const wsUrl = `wss://${hostPart}`;
    
    // Initialize Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Get shared types
    const messagesArray = ydoc.getArray<any>('messages');
    const usersMap = ydoc.getMap<any>('users');
    messagesArrayRef.current = messagesArray;
    usersMapRef.current = usersMap;

    // Connect to Y-Sweet server
    const provider = new WebsocketProvider(
      wsUrl,
      authPart,
      ydoc,
      {
        connect: true,
        params: {}
      }
    );
    providerRef.current = provider;

    // Update messages when array changes
    const updateMessages = () => {
      const msgs = messagesArray.toArray();
      setMessages(msgs);
    };

    // Update active users
    const updateUsers = () => {
      const now = Date.now();
      const users = new Map<string, User>();
      const cursorMap = new Map<string, User>();
      
      // Always add AI Assistant as active
      users.set(aiUser.id, {
        name: aiUser.name,
        color: aiUser.color,
        typing: '',
        lastSeen: now,
      });
      
      usersMap.forEach((user, userId) => {
        // Consider users active if seen in last 10 seconds
        if (now - user.lastSeen < 10000) {
          users.set(userId, user);
          
          // Add to cursor map if has cursor position (exclude AI)
          if (userId !== aiUser.id && user.cursorX !== undefined && user.cursorY !== undefined) {
            cursorMap.set(userId, user);
          }
        }
      });
      
      setActiveUsers(users);
      setCursors(cursorMap);
    };

    messagesArray.observe(updateMessages);
    usersMap.observe(updateUsers);

    // Initial load
    updateMessages();
    updateUsers();

    // Register current user
    const updateUserPresence = () => {
      usersMap.set(currentUser.id, {
        name: currentUser.name,
        color: currentUser.color,
        typing: '',
        lastSeen: Date.now(),
      });
    };

    updateUserPresence();

    // Update presence every 5 seconds
    const presenceInterval = setInterval(updateUserPresence, 5000);

    // Cleanup
    return () => {
      clearInterval(presenceInterval);
      messagesArray.unobserve(updateMessages);
      usersMap.unobserve(updateUsers);
      
      // Remove user from presence
      if (usersMapRef.current) {
        usersMapRef.current.delete(currentUser.id);
      }
      
      provider.destroy();
      ydoc.destroy();
    };
  }, [currentUser]);

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!usersMapRef.current) return;
      
      const currentUserData = usersMapRef.current.get(currentUser.id);
      if (currentUserData) {
        // Update cursor position in Yjs
        usersMapRef.current.set(currentUser.id, {
          ...currentUserData,
          cursorX: e.clientX,
          cursorY: e.clientY,
          lastSeen: Date.now(),
        });
      }
    };

    // Throttle mouse updates to avoid too many updates
    let throttleTimeout: NodeJS.Timeout | null = null;
    const throttledMouseMove = (e: MouseEvent) => {
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          handleMouseMove(e);
          throttleTimeout = null;
        }, 50); // Update every 50ms
      }
    };

    window.addEventListener('mousemove', throttledMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', throttledMouseMove);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [currentUser]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Update typing status
    if (usersMapRef.current) {
      const currentUserData = usersMapRef.current.get(currentUser.id);
      if (currentUserData) {
        usersMapRef.current.set(currentUser.id, {
          ...currentUserData,
          typing: value,
          lastSeen: Date.now(),
        });
      }
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || !messagesArrayRef.current) return;

    const messageId = `${currentUser.id}-${Date.now()}`;
    const message: Message = {
      id: messageId,
      text: inputValue.trim(),
      sender: currentUser.name,
      timestamp: Date.now(),
      color: currentUser.color,
    };

    messagesArrayRef.current.push([message]);
    
    // Get recent messages for context (last 5 messages)
    const recentMessages = messagesArrayRef.current.toArray().slice(-5);
    
    // Call AI API to get response
    fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: inputValue.trim(),
        conversationHistory: recentMessages,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.response && messagesArrayRef.current) {
          // Add AI response to chat with replyTo field
          const aiMessage: Message = {
            id: `ai-${Date.now()}`,
            text: data.response,
            sender: '🤖 AI Assistant',
            timestamp: Date.now(),
            color: '#9b59b6',
            replyTo: messageId, // Link AI response to user message
          };
          messagesArrayRef.current.push([aiMessage]);
        }
      })
      .catch(error => {
        console.error('Failed to get AI response:', error);
      });
    
    setInputValue('');

    // Clear typing status
    if (usersMapRef.current) {
      const currentUserData = usersMapRef.current.get(currentUser.id);
      if (currentUserData) {
        usersMapRef.current.set(currentUser.id, {
          ...currentUserData,
          typing: '',
          lastSeen: Date.now(),
        });
      }
    }
  };

  // Get users who are typing (excluding current user)
  const typingUsers = Array.from(activeUsers.entries())
    .filter(([userId, user]) => userId !== currentUser.id && user.typing)
    .map(([_, user]) => user);

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f5f5f5',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Other users' cursors */}
      {Array.from(cursors.entries()).map(([userId, user]) => {
        if (userId === currentUser.id) return null; // Don't show own cursor
        
        return (
          <div
            key={userId}
            style={{
              position: 'fixed',
              left: user.cursorX,
              top: user.cursorY,
              pointerEvents: 'none',
              zIndex: 9999,
              transform: 'translate(-2px, -2px)',
              transition: 'left 0.1s ease-out, top 0.1s ease-out'
            }}
          >
            {/* Cursor pointer */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
              }}
            >
              <path
                d="M5.5 3.5L19.5 12L11.5 14.5L8.5 20.5L5.5 3.5Z"
                fill={user.color}
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>
            {/* User name label */}
            <div
              style={{
                position: 'absolute',
                left: '20px',
                top: '2px',
                backgroundColor: user.color,
                color: 'white',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
            >
              {user.name}
            </div>
          </div>
        );
      })}

      {/* Sidebar - Active Users */}
      <div style={{
        width: '250px',
        backgroundColor: '#2c3e50',
        color: 'white',
        padding: '20px',
        boxShadow: '2px 0 5px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '20px',
          fontSize: '18px',
          fontWeight: '600'
        }}>
          Active Users ({activeUsers.size})
        </h2>
        <div>
          {Array.from(activeUsers.entries()).map(([userId, user]) => {
            const isAI = userId === aiUser.id;
            const isCurrentUser = userId === currentUser.id;
            
            return (
              <div
                key={userId}
                style={{
                  padding: '10px',
                  marginBottom: '8px',
                  backgroundColor: isAI 
                    ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)'
                    : isCurrentUser 
                      ? 'rgba(255,255,255,0.1)' 
                      : 'transparent',
                  background: isAI 
                    ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)'
                    : isCurrentUser 
                      ? 'rgba(255,255,255,0.1)' 
                      : 'transparent',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  border: isAI ? '1px solid rgba(255, 215, 0, 0.3)' : 'none',
                  position: 'relative'
                }}
              >
                {isAI && (
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    right: '6px',
                    fontSize: '16px'
                  }}>
                    ✨
                  </div>
                )}
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: user.color,
                    boxShadow: isAI ? '0 0 8px rgba(255, 215, 0, 0.6)' : 'none'
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '500' }}>
                    {user.name}
                    {isCurrentUser && ' (You)'}
                  </div>
                  {user.typing && (
                    <div style={{ 
                      fontSize: '11px', 
                      color: '#95a5a6',
                      fontStyle: 'italic',
                      marginTop: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      "{user.typing}"
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: 'white'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: '24px',
            fontWeight: '600',
            color: '#2c3e50'
          }}>
            🤖 AI-Powered Collaborative Chat
          </h1>
          <p style={{ 
            margin: '5px 0 0 0', 
            color: '#7f8c8d',
            fontSize: '14px'
          }}>
            Chat with friends and get AI responses • Powered by Yjs, Y-Sweet & Gemini
          </p>
        </div>

        {/* Messages Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {messages.length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: '#95a5a6',
              marginTop: '40px',
              fontSize: '16px'
            }}>
              No messages yet. Start the conversation! 💬
            </div>
          ) : (
            messages.map((message, index) => {
              const isAI = message.sender === aiUser.name;
              const isCurrentUser = message.sender === currentUser.name;
              
              // Skip rendering AI messages separately, they'll be rendered with their parent
              if (isAI) return null;
              
              // Find AI response for this message
              const aiResponse = messages.find(m => 
                m.sender === aiUser.name && m.replyTo === message.id
              );
              
              return (
                <div
                  key={message.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isCurrentUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    alignSelf: isCurrentUser ? 'flex-end' : 'flex-start',
                    gap: '8px'
                  }}
                >
                  {/* User Message */}
                  <div style={{ width: '100%' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px'
                    }}>
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: message.color,
                        }}
                      />
                      <span style={{ 
                        fontSize: '12px', 
                        fontWeight: '600',
                        color: message.color 
                      }}>
                        {message.sender}
                      </span>
                      <span style={{ fontSize: '11px', color: '#95a5a6' }}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: isCurrentUser ? message.color : '#ecf0f1',
                        color: isCurrentUser ? 'white' : '#2c3e50',
                        wordBreak: 'break-word',
                        boxShadow: aiResponse 
                          ? '0 2px 8px rgba(102, 126, 234, 0.2)' 
                          : '0 1px 2px rgba(0,0,0,0.1)',
                        borderBottomLeftRadius: aiResponse ? '4px' : '12px',
                        borderBottomRightRadius: aiResponse ? '4px' : '12px',
                        position: 'relative'
                      }}
                    >
                      {message.text}
                      {aiResponse && (
                        <div style={{
                          position: 'absolute',
                          bottom: '-6px',
                          left: '20px',
                          width: '2px',
                          height: '12px',
                          background: 'linear-gradient(180deg, rgba(102, 126, 234, 0.5) 0%, rgba(118, 75, 162, 0.8) 100%)',
                        }} />
                      )}
                    </div>
                  </div>
                  
                  {/* AI Response - Connected */}
                  {aiResponse && (
                    <div style={{ 
                      width: '100%',
                      paddingLeft: '12px',
                      borderLeft: '3px solid transparent',
                      borderImage: 'linear-gradient(180deg, rgba(102, 126, 234, 0.8) 0%, rgba(118, 75, 162, 0.4) 100%)',
                      borderImageSlice: 1,
                      position: 'relative'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                      }}>
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: aiResponse.color,
                            boxShadow: '0 0 8px rgba(155, 89, 182, 0.6)'
                          }}
                        />
                        <span style={{ 
                          fontSize: '12px', 
                          fontWeight: '600',
                          color: aiResponse.color 
                        }}>
                          {aiResponse.sender}
                        </span>
                        <span style={{ fontSize: '11px', color: '#95a5a6' }}>
                          {new Date(aiResponse.timestamp).toLocaleTimeString()}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          backgroundColor: '#ffd700',
                          color: '#764ba2',
                          padding: '2px 6px',
                          borderRadius: '8px',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          AI Reply
                        </span>
                      </div>
                      <div
                        style={{
                          padding: '16px 20px',
                          borderRadius: '16px',
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: 'white',
                          wordBreak: 'break-word',
                          boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                          border: '2px solid rgba(255, 255, 255, 0.2)',
                          position: 'relative',
                          fontSize: '15px',
                          lineHeight: '1.6',
                          borderTopLeftRadius: '4px'
                        }}
                      >
                        {aiResponse.text}
                        <div style={{
                          position: 'absolute',
                          bottom: '8px',
                          right: '12px',
                          fontSize: '20px',
                          opacity: 0.3
                        }}>
                          ✨
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div style={{
            padding: '12px 20px',
            fontSize: '13px',
            color: '#2c3e50',
            backgroundColor: '#f8f9fa',
            borderTop: '1px solid #e0e0e0'
          }}>
            {typingUsers.map((user, index) => (
              <div key={index} style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: '600', color: user.color }}>
                  {user.name}
                </span>
                <span style={{ color: '#7f8c8d', fontStyle: 'italic' }}>
                  : "{user.typing}"
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Input Area */}
        <form
          onSubmit={handleSendMessage}
          style={{
            padding: '20px',
            borderTop: '1px solid #e0e0e0',
            backgroundColor: 'white',
            display: 'flex',
            gap: '12px'
          }}
        >
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '2px solid #e0e0e0',
              borderRadius: '24px',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = '#3498db'}
            onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            style={{
              padding: '12px 24px',
              backgroundColor: inputValue.trim() ? '#3498db' : '#bdc3c7',
              color: 'white',
              border: 'none',
              borderRadius: '24px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (inputValue.trim()) {
                e.currentTarget.style.backgroundColor = '#2980b9';
              }
            }}
            onMouseLeave={(e) => {
              if (inputValue.trim()) {
                e.currentTarget.style.backgroundColor = '#3498db';
              }
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
