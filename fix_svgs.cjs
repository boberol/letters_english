const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const reversePath = require('svg-path-reverse');

const SVG_DIR = path.join(__dirname, 'src', 'assets', 'letters');

// Helper to check if a stroke is "backwards" based on standard handwriting
// Handwriting generally goes: Top to Bottom, Left to Right
const isBackwards = (startX, startY, endX, endY) => {
  const dx = endX - startX;
  const dy = endY - startY;
  
  // If the path is a closed loop or tiny dot, don't reverse
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return false;

  if (Math.abs(dy) > Math.abs(dx)) {
    // Mostly vertical. If it goes Bottom to Top (startY > endY), it's backwards!
    return startY > endY;
  } else {
    // Mostly horizontal. If it goes Right to Left (startX > endX), it's backwards!
    return startX > endX;
  }
};

// Simple regex to extract first and last points from a 'd' string
const getPathEndpoints = (d) => {
  // Try to parse the first absolute M command
  const startMatch = d.match(/^[Mm]\s*([-\d.]+)[,\s]+([-\d.]+)/);
  
  // Try to get the very last coordinates in the path (rough heuristic)
  // Find all coordinate pairs.
  const allCoords = [...d.matchAll(/([-\d.]+)[,\s]+([-\d.]+)/g)];
  
  if (startMatch && allCoords.length >= 2) {
    const startX = parseFloat(startMatch[1]);
    const startY = parseFloat(startMatch[2]);
    
    // The last match might be relative! If it's a closed path (Z), it ends at start
    if (/[Zz]\s*$/.test(d)) {
      return { startX, startY, endX: startX, endY: startY };
    }
    
    // We cannot easily determine the absolute end coordinate of a complex relative path without a full SVG path parser.
    // However, we can use a trick: If the path is entirely absolute, the last coordinates are the end points!
    // Or we can rely on `svg-path-reverse.reverse` and see if the reversed path starts with a lower Y!
    return null; // Signals we need a better check
  }
  return null;
};

// Parse absolute endpoints safely by converting the path to absolute first
// svg-path-reverse does not expose absolute conversion directly, but we can do a trick!
const checkPathBackwards = (d) => {
  try {
    // Reverse the path using the library
    const reversed = reversePath.reverse(d);
    
    // Compare the starting Y of the original vs the reversed
    const getStartY = (pathStr) => {
      const match = pathStr.match(/^[Mm]\s*([-\d.]+)[,\s]+([-\d.]+)/);
      return match ? parseFloat(match[2]) : null;
    };
    const getStartX = (pathStr) => {
      const match = pathStr.match(/^[Mm]\s*([-\d.]+)[,\s]+([-\d.]+)/);
      return match ? parseFloat(match[1]) : null;
    };
    
    const origY = getStartY(d);
    const revY = getStartY(reversed);
    const origX = getStartX(d);
    const revX = getStartX(reversed);
    
    if (origY !== null && revY !== null) {
      return isBackwards(origX, origY, revX, revY);
    }
  } catch(e) {
    console.error("Error checking path:", e);
  }
  return false;
};

const processFiles = () => {
  if (!fs.existsSync(SVG_DIR)) {
    console.log("No custom SVG directory found.");
    return;
  }
  
  const files = fs.readdirSync(SVG_DIR).filter(f => f.endsWith('.svg'));
  
  files.forEach(file => {
    const filePath = path.join(SVG_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const dom = new JSDOM(content);
    const document = dom.window.document;
    let modified = false;

    // Process Paths
    document.querySelectorAll('path').forEach(pathNode => {
      const d = pathNode.getAttribute('d');
      if (d && checkPathBackwards(d)) {
        try {
          const newD = reversePath.reverse(d);
          pathNode.setAttribute('d', newD);
          modified = true;
          console.log(`Reversed path in ${file}`);
        } catch(e) {
          console.error(`Failed to reverse path in ${file}:`, e);
        }
      }
    });

    // Process Lines
    document.querySelectorAll('line').forEach(lineNode => {
      const x1 = parseFloat(lineNode.getAttribute('x1') || 0);
      const y1 = parseFloat(lineNode.getAttribute('y1') || 0);
      const x2 = parseFloat(lineNode.getAttribute('x2') || 0);
      const y2 = parseFloat(lineNode.getAttribute('y2') || 0);
      
      if (isBackwards(x1, y1, x2, y2)) {
        lineNode.setAttribute('x1', x2);
        lineNode.setAttribute('y1', y2);
        lineNode.setAttribute('x2', x1);
        lineNode.setAttribute('y2', y1);
        modified = true;
        console.log(`Reversed line in ${file}`);
      }
    });

    // Process Polylines (Polygon is closed so direction doesn't matter much visually, but we can do it)
    document.querySelectorAll('polyline, polygon').forEach(polyNode => {
      const pointsStr = polyNode.getAttribute('points');
      if (pointsStr) {
        const points = pointsStr.trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
        if (points.length >= 4) {
          const startX = points[0];
          const startY = points[1];
          const endX = points[points.length - 2];
          const endY = points[points.length - 1];
          
          if (polyNode.tagName.toLowerCase() !== 'polygon' && isBackwards(startX, startY, endX, endY)) {
            const reversedPoints = [];
            for (let i = points.length - 2; i >= 0; i -= 2) {
              reversedPoints.push(points[i]);
              reversedPoints.push(points[i+1]);
            }
            polyNode.setAttribute('points', reversedPoints.join(' '));
            modified = true;
            console.log(`Reversed ${polyNode.tagName} in ${file}`);
          }
        }
      }
    });

    if (modified) {
      // Serialize back to file
      const serializer = new dom.window.XMLSerializer();
      let newContent = serializer.serializeToString(document);
      // Clean up jsdom injected tags if any
      newContent = newContent.replace(/<html[^>]*><head><\/head><body>/, '');
      newContent = newContent.replace(/<\/body><\/html>/, '');
      
      fs.writeFileSync(filePath, newContent);
    }
  });
};

processFiles();
