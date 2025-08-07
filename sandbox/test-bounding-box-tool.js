const { GoogleGenAI, Modality } = require('@google/genai');
const { readFileSync } = require('fs');

// Import your existing drawScreenBoundingBox function
const { handleDrawScreenBoundingBox } = require('../src/utils/gemini');

const ai = new GoogleGenAI({});
const model = 'gemini-live-2.5-flash-preview';

// Your drawScreenBoundingBox function declaration
const drawScreenBoundingBoxTool = {
    name: "drawScreenBoundingBox",
    description: "Draw a bounding box on the screen overlay. Coordinates should be in pixels from the top-left corner of the screen. The box will be automatically removed after the specified duration.",
    parameters: {
        type: "object",
        properties: {
            xmin: {
                type: "number",
                description: "Left X coordinate in pixels"
            },
            ymin: {
                type: "number", 
                description: "Top Y coordinate in pixels"
            },
            xmax: {
                type: "number",
                description: "Right X coordinate in pixels"
            },
            ymax: {
                type: "number",
                description: "Bottom Y coordinate in pixels"
            },
            options: {
                type: "object",
                description: "Optional styling and behavior options",
                properties: {
                    color: {
                        type: "string",
                        description: "Border color in hex format (e.g., '#ff0000' for red)"
                    },
                    width: {
                        type: "number",
                        description: "Border width in pixels"
                    },
                    duration: {
                        type: "number",
                        description: "Duration in milliseconds before auto-removal (0 for permanent)"
                    },
                    label: {
                        type: "string",
                        description: "Optional text label to display with the bounding box"
                    }
                }
            }
        },
        required: ["xmin", "ymin", "xmax", "ymax"]
    }
};

const tools = [{ functionDeclarations: [drawScreenBoundingBoxTool] }];

const config = {
    responseModalities: [Modality.TEXT],
    tools: tools,
    systemInstruction: {
        parts: [{ 
            text: "You are a helpful assistant that can draw bounding boxes on the screen. When asked to highlight or point to areas on the screen, use the drawScreenBoundingBox function with appropriate coordinates and styling options." 
        }]
    }
};

// Function to prepare image data for Live API
function prepareImageForLive(imagePath) {
    try {
        const imageBuffer = readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');
        
        // Determine MIME type based on file extension
        const extension = imagePath.toLowerCase().split('.').pop();
        let mimeType;
        switch (extension) {
            case 'jpg':
            case 'jpeg':
                mimeType = 'image/jpeg';
                break;
            case 'png':
                mimeType = 'image/png';
                break;
            case 'gif':
                mimeType = 'image/gif';
                break;
            case 'webp':
                mimeType = 'image/webp';
                break;
            default:
                mimeType = 'image/jpeg';
        }
        
        console.log(`✅ Successfully loaded image: ${imagePath} (${mimeType})`);
        return {
            inlineData: {
                data: base64Image,
                mimeType: mimeType
            }
        };
    } catch (error) {
        console.error(`❌ Error loading image: ${imagePath}`);
        throw error;
    }
}

// Implementation of the drawScreenBoundingBox function handler
function handleDrawScreenBoundingBoxLocal(args) {
    console.log('🎯 === DRAW SCREEN BOUNDING BOX CALLED ===');
    console.log('Arguments:', JSON.stringify(args, null, 2));
    console.log('==========================================\n');
    
    try {
        // In a real application, this would call your actual drawScreenBoundingBox function
        // For testing purposes, we'll just simulate it
        const result = handleDrawScreenBoundingBox(args);
        console.log('📊 Result:', result);
        return result;
    } catch (error) {
        console.error('❌ Error:', error);
        return {
            result: "error",
            message: error.message
        };
    }
}

// Live API function for testing bounding box drawing
async function testBoundingBoxTool(prompt, imagePath = null) {
    const responseQueue = [];

    async function waitMessage() {
        let done = false;
        let message = undefined;
        while (!done) {
            message = responseQueue.shift();
            if (message) {
                done = true;
            } else {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
        return message;
    }

    async function handleTurn() {
        const turns = [];
        let done = false;
        while (!done) {
            const message = await waitMessage();
            turns.push(message);
            if (message.serverContent && message.serverContent.turnComplete) {
                done = true;
            } else if (message.toolCall) {
                done = true;
            }
        }
        return turns;
    }

    const session = await ai.live.connect({
        model: model,
        callbacks: {
            onopen: function () {
                console.log('🔗 Live session connected');
            },
            onmessage: function (message) {
                responseQueue.push(message);
            },
            onerror: function (e) {
                console.error('❌ Error:', e.message);
            },
            onclose: function (e) {
                console.log('🔚 Session closed:', e.reason);
            },
        },
        config: config,
    });

    try {
        console.log('📤 Sending prompt...');
        
        const parts = [{ text: prompt }];
        
        // Add image if provided
        if (imagePath) {
            const imageData = prepareImageForLive(imagePath);
            parts.unshift(imageData);
        }
        
        session.sendClientContent({ 
            turns: [
                {
                    role: "user",
                    parts: parts
                }
            ]
        });

        const turns = await handleTurn();

        for (const turn of turns) {
            if (turn.serverContent && turn.serverContent.modelTurn && turn.serverContent.modelTurn.parts) {
                for (const part of turn.serverContent.modelTurn.parts) {
                    if (part.text) {
                        console.log('🤖 AI Response:', part.text);
                    }
                }
            }
            else if (turn.toolCall) {
                const functionResponses = [];
                for (const fc of turn.toolCall.functionCalls) {
                    console.log(`🔧 Tool called: ${fc.name}`);
                    
                    const response = handleDrawScreenBoundingBoxLocal(fc.args);
                    
                    functionResponses.push({
                        id: fc.id,
                        name: fc.name,
                        response: response
                    });
                }

                console.log('📤 Sending tool responses...\n');
                session.sendToolResponse({ functionResponses: functionResponses });
                
                // Wait for final response after tool call
                const finalTurns = await handleTurn();
                for (const finalTurn of finalTurns) {
                    if (finalTurn.serverContent && finalTurn.serverContent.modelTurn && finalTurn.serverContent.modelTurn.parts) {
                        for (const part of finalTurn.serverContent.modelTurn.parts) {
                            if (part.text) {
                                console.log('🤖 Final AI Response:', part.text);
                            }
                        }
                    }
                }
            }
        }

    } catch (error) {
        console.error('Error during test:', error);
        throw error;
    } finally {
        session.close();
    }
}

// Test cases
async function main() {
    console.log('🧪 Testing drawScreenBoundingBox tool with Gemini Live API\n');
    
    // Test 1: Simple bounding box request
    console.log('=== Test 1: Simple bounding box ===');
    await testBoundingBoxTool("Please draw a red bounding box at coordinates (100, 100) to (400, 300) on the screen.");
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 2: Multiple bounding boxes
    console.log('=== Test 2: Multiple bounding boxes ===');
    await testBoundingBoxTool("Draw two bounding boxes: one green box from (50, 50) to (200, 150) and one blue box from (300, 200) to (500, 350).");
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 3: Bounding box with custom options
    console.log('=== Test 3: Custom styled bounding box ===');
    await testBoundingBoxTool("Create a yellow bounding box with thick borders (width 5) at (150, 75) to (350, 225) that lasts for 10 seconds with the label 'Important Area'.");
    
    // Uncomment to test with an image
    // console.log('\n' + '='.repeat(50) + '\n');
    // console.log('=== Test 4: Image analysis with bounding boxes ===');
    // const imagePath = "C:\\Users\\gabriel\\Pictures\\solid3.png";
    // await testBoundingBoxTool("Analyze this image and draw bounding boxes around the main objects you can see.", imagePath);
}

main().catch((e) => console.error('Error:', e));