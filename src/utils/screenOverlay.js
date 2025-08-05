const { BrowserWindow, screen } = require('electron');
const path = require('path');

let overlayWindow = null;
let boundingBoxes = new Map();

/**
 * Creates the screen overlay window
 */
function createScreenOverlay() {
    if (overlayWindow) {
        return overlayWindow;
    }

    // Get primary display dimensions
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    overlayWindow = new BrowserWindow({
        width: width,
        height: height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        focusable: false,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    // Set window to be click-through
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    // Load the overlay HTML
    const overlayHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: transparent;
            overflow: hidden;
            width: 100vw;
            height: 100vh;
        }
        .bounding-box {
            position: absolute;
            border: 2px solid #ff0000;
            background: transparent;
            pointer-events: none;
            box-sizing: border-box;
            animation: fadeIn 0.2s ease-in;
        }
        .bounding-box-label {
            position: absolute;
            top: -25px;
            left: 0;
            background: #ff0000;
            color: white;
            padding: 2px 6px;
            font-size: 12px;
            font-family: monospace;
            white-space: nowrap;
            border-radius: 2px;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeOut {
            from { opacity: 1; transform: scale(1); }
            to { opacity: 0; transform: scale(0.95); }
        }
    </style>
</head>
<body>
    <script>
        const { ipcRenderer } = require('electron');
        
        // Listen for bounding box commands
        ipcRenderer.on('draw-bounding-box', (event, data) => {
            drawBoundingBox(data);
        });
        
        ipcRenderer.on('remove-bounding-box', (event, boxId) => {
            removeBoundingBox(boxId);
        });
        
        ipcRenderer.on('clear-all-bounding-boxes', () => {
            clearAllBoundingBoxes();
        });
        
        function drawBoundingBox(data) {
            const { boxId, xmin, ymin, xmax, ymax, options } = data;
            const { color = '#ff0000', width = 2, label = null } = options;
            
            // Calculate dimensions
            const boxWidth = xmax - xmin;
            const boxHeight = ymax - ymin;
            
            // Create bounding box element
            const boxElement = document.createElement('div');
            boxElement.id = boxId;
            boxElement.className = 'bounding-box';
            boxElement.style.left = xmin + 'px';
            boxElement.style.top = ymin + 'px';
            boxElement.style.width = boxWidth + 'px';
            boxElement.style.height = boxHeight + 'px';
            boxElement.style.borderColor = color;
            boxElement.style.borderWidth = width + 'px';
            
            // Add label if provided
            if (label) {
                const labelElement = document.createElement('div');
                labelElement.className = 'bounding-box-label';
                labelElement.style.backgroundColor = color;
                labelElement.textContent = label;
                boxElement.appendChild(labelElement);
            }
            
            document.body.appendChild(boxElement);
            console.log('Drew screen bounding box:', boxId);
        }
        
        function removeBoundingBox(boxId) {
            const element = document.getElementById(boxId);
            if (element) {
                element.style.animation = 'fadeOut 0.2s ease-out';
                setTimeout(() => {
                    if (element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                }, 200);
                console.log('Removed screen bounding box:', boxId);
            }
        }
        
        function clearAllBoundingBoxes() {
            const boxes = document.querySelectorAll('.bounding-box');
            boxes.forEach(box => {
                box.style.animation = 'fadeOut 0.2s ease-out';
                setTimeout(() => {
                    if (box.parentNode) {
                        box.parentNode.removeChild(box);
                    }
                }, 200);
            });
            console.log('Cleared all screen bounding boxes');
        }
    </script>
</body>
    </html>`;

    overlayWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(overlayHtml));

    overlayWindow.on('closed', () => {
        overlayWindow = null;
        boundingBoxes.clear();
    });

    return overlayWindow;
}

/**
 * Shows the screen overlay
 */
function showScreenOverlay() {
    const overlay = createScreenOverlay();
    overlay.show();
    console.log('Screen overlay shown');
}

/**
 * Hides the screen overlay
 */
function hideScreenOverlay() {
    if (overlayWindow) {
        overlayWindow.hide();
        console.log('Screen overlay hidden');
    }
}

/**
 * Draws a bounding box on the screen
 */
function drawScreenBoundingBox(xmin, ymin, xmax, ymax, options = {}) {
    const boxId = `bbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const duration = options.duration !== undefined ? options.duration : 0; // Default to permanent for development
    
    // Store bounding box info
    boundingBoxes.set(boxId, {
        xmin, ymin, xmax, ymax, options, timestamp: Date.now()
    });
    
    // Ensure overlay is visible
    showScreenOverlay();
    
    // Send draw command to overlay window
    if (overlayWindow) {
        overlayWindow.webContents.send('draw-bounding-box', {
            boxId, xmin, ymin, xmax, ymax, options
        });
    }
    
    // Auto-remove after duration (if specified) - DISABLED FOR DEVELOPMENT
    if (duration > 0) {
        console.log(`[TIMER] Bounding box ${boxId} scheduled for removal in ${duration}ms - DISABLED FOR DEVELOPMENT`);
        // setTimeout(() => {
        //     removeScreenBoundingBox(boxId);
        // }, duration);
    } else {
        console.log(`[PERMANENT] Bounding box ${boxId} set to permanent (duration: ${duration})`);
    }
    
    console.log(`Drew screen bounding box: (${xmin}, ${ymin}) to (${xmax}, ${ymax})`);
    return boxId;
}

/**
 * Removes a specific bounding box from the screen
 */
function removeScreenBoundingBox(boxId) {
    if (boundingBoxes.has(boxId)) {
        console.log(`[REMOVE] === REMOVING BOUNDING BOX ===`);
        console.log(`Box ID: ${boxId}`);
        console.log(`Call stack:`, new Error().stack);
        
        boundingBoxes.delete(boxId);
        
        if (overlayWindow) {
            overlayWindow.webContents.send('remove-bounding-box', boxId);
        }
        
        // Hide overlay if no boxes remain
        if (boundingBoxes.size === 0) {
            hideScreenOverlay();
        }
        
        console.log('Removed screen bounding box:', boxId);
    }
}

/**
 * Clears all bounding boxes from the screen
 */
function clearAllScreenBoundingBoxes() {
    boundingBoxes.clear();
    
    if (overlayWindow) {
        overlayWindow.webContents.send('clear-all-bounding-boxes');
    }
    
    hideScreenOverlay();
    console.log('Cleared all screen bounding boxes');
}

/**
 * Closes the screen overlay
 */
function closeScreenOverlay() {
    if (overlayWindow) {
        overlayWindow.close();
        overlayWindow = null;
        boundingBoxes.clear();
        console.log('Screen overlay closed');
    }
}

module.exports = {
    createScreenOverlay,
    showScreenOverlay,
    hideScreenOverlay,
    drawScreenBoundingBox,
    removeScreenBoundingBox,
    clearAllScreenBoundingBoxes,
    closeScreenOverlay
};