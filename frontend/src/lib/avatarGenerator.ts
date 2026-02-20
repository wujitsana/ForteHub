/**
 * Generate a deterministic avatar SVG based on wallet address
 * Creates Brownian motion (random walk) paths for organic, natural-looking designs
 * Uses the address as a seed for consistent, unique results
 */

export function generateAvatarSVG(address: string): string {
  // Normalize address
  const addr = address.toLowerCase().replace('0x', '');

  // Create SVG with Brownian motion random walk design
  const svg = createBrownianAvatarSVG(addr);

  return svg;
}

interface Color {
  r: number;
  g: number;
  b: number;
}

function hashToNumber(str: string, index: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char + index;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function generateColorPalette(addr: string): Color[] {
  const colors: Color[] = [];

  // Use multiple different hash seeds to get radically different colors per account
  const hash1 = hashToNumber(addr, 100);
  const hash2 = hashToNumber(addr, 200);
  const hash3 = hashToNumber(addr, 300);
  const hash4 = hashToNumber(addr, 400);
  const hash5 = hashToNumber(addr, 500);

  // Background color - light/pastel
  const bgHue = hash1 % 360;
  const bgSat = 30 + (hash2 % 50); // 30-80% saturation
  const bgLight = 75 + (hash3 % 20); // 75-95% lightness - LIGHT background
  colors.push(hslToRgb(bgHue, bgSat, bgLight));

  // Primary inkblot color - DARK and CONTRASTING
  // Use completely different hash for hue (not offset-based)
  let color1Hue = (hash4 % 360);

  // Ensure STRONG hue contrast - if too close to background hue, rotate by 180
  const hueDiff = Math.abs(color1Hue - bgHue);
  if (hueDiff < 90) {
    // If hues are similar, rotate by 180 degrees for opposite color
    color1Hue = (color1Hue + 180) % 360;
  }

  const color1Sat = 70 + (hashToNumber(addr, 501) % 30); // 70-100% saturation - vibrant
  const color1Light = 20 + (hashToNumber(addr, 502) % 30); // 20-50% lightness - DARK inkblot
  colors.push(hslToRgb(color1Hue, color1Sat, color1Light));

  // Extra colors for future use
  const color2Hue = (hashToNumber(addr, 2) % 360);
  colors.push(hslToRgb(color2Hue, 75, 55));

  const color3Hue = hashToNumber(addr, 3) % 360;
  colors.push(hslToRgb(color3Hue, 85, 45));

  return colors;
}

function hslToRgb(h: number, s: number, l: number): Color {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return { r: f(0), g: f(8), b: f(4) };
}

function createBrownianAvatarSVG(addr: string): string {
  const size = 200;
  const centerX = size / 2;
  const centerY = size / 2;

  const elements: string[] = [];

  // White background
  elements.push(`<rect width="${size}" height="${size}" fill="white"/>`);

  // Generate multiple Brownian motion paths - draw as connected lines
  const pathCount = 18 + (hashToNumber(addr, 100) % 16); // 18-33 paths

  for (let p = 0; p < pathCount; p++) {
    // Each path starts from a different position
    const startAngle = (p / pathCount) * Math.PI * 2;
    const startDist = 10 + (hashToNumber(addr, 500 + p * 50) % 80); // 10-90px from center
    const startX = centerX + startDist * Math.cos(startAngle);
    const startY = centerY + startDist * Math.sin(startAngle);

    // Path-specific parameters
    const stepCount = 250 + (hashToNumber(addr, 1000 + p * 100) % 350); // 250-600 steps
    const stepSize = 0.6 + ((hashToNumber(addr, 2000 + p * 100) % 18) / 10); // 0.6-2.4 pixel steps
    const strokeWidth = 1.0 + ((hashToNumber(addr, 3000 + p * 100) % 12) / 10); // 1.0-2.2 visible lines
    const opacity = 0.4 + ((hashToNumber(addr, 4000 + p * 100) % 60) / 100); // 0.4-1.0 for line transparency

    // Generate and draw the Brownian motion path as a line
    const pathData = generateBrownianPath(addr, p, startX, startY, stepCount, stepSize);
    if (pathData) {
      elements.push(`<path d="${pathData}" fill="none" stroke="black" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${elements.join('\n')}
  </svg>`;
}

function generateBrownianPath(
  addr: string,
  pathIndex: number,
  startX: number,
  startY: number,
  stepCount: number,
  stepSize: number
): string {
  let x = startX;
  let y = startY;
  const points: Array<[number, number]> = [[x, y]];

  // Generate random walk using deterministic hash-based randomness
  for (let step = 0; step < stepCount; step++) {
    // Use address hash to generate pseudo-random angle
    const angleHash = hashToNumber(addr, 5000 + pathIndex * 1000 + step * 10);
    const angle = (angleHash % 360) * (Math.PI / 180);

    // Move in random direction
    x += Math.cos(angle) * stepSize;
    y += Math.sin(angle) * stepSize;

    // Keep within bounds (bounce off edges)
    const padding = 10;
    if (x < padding) x = padding;
    if (x > 200 - padding) x = 200 - padding;
    if (y < padding) y = padding;
    if (y > 200 - padding) y = 200 - padding;

    points.push([x, y]);
  }

  // Create SVG path from points
  if (points.length === 0) return '';

  let pathData = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    pathData += ` L ${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)}`;
  }

  return pathData;
}

function generateSpiral(
  addr: string,
  spiralIndex: number,
  centerX: number,
  centerY: number,
  size: number,
  totalSpirals: number,
  sizeMultiplier: number = 1.0
): string {
  // Each spiral has unique parameters based on address hash
  // Use much larger maxRadius to ensure spirals expand far and clearly show spiral pattern
  const maxRadius = (size / 2) * 0.95 * sizeMultiplier; // Scale by size multiplier, use 95% of space

  // Vary turns count for good balance of visible spirals and diversity
  const turns = 5 + (hashToNumber(addr, 4000 + spiralIndex * 100) % 12); // 5-16 complete turns

  // Calculate tightness - make it expand MUCH faster for visible spiral effect
  const totalAngle = turns * Math.PI * 2;
  const baseTightness = maxRadius / totalAngle;

  // Vary tightness for diverse spiral shapes (some tight, some loose) with good expansion visibility
  const tightnessVariation = 1.0 + ((hashToNumber(addr, 3000 + spiralIndex * 100) % 100) / 100); // 1.0 - 2.0x multiplier for balanced expansion
  const tightness = baseTightness * tightnessVariation;

  // Rotation offset unique per spiral
  const rotationOffset = (hashToNumber(addr, 2000 + spiralIndex * 100) % 360) * (Math.PI / 180);

  // Variable direction (clockwise or counterclockwise)
  const direction = hashToNumber(addr, 5000 + spiralIndex * 100) % 2 === 0 ? 1 : -1;

  const pointsPerTurn = 100 + (hashToNumber(addr, 6000 + spiralIndex) % 50); // 100-150 points per turn for smoother curves
  const angleStep = (2 * Math.PI) / pointsPerTurn;

  const points: Array<[number, number]> = [];

  // Generate spiral points - Archimedean spiral: r = b*θ
  for (let angle = 0; angle < totalAngle; angle += angleStep) {
    const rotatedAngle = (angle * direction) + rotationOffset;
    const radius = tightness * angle;

    const x = centerX + radius * Math.cos(rotatedAngle);
    const y = centerY + radius * Math.sin(rotatedAngle);
    points.push([x, y]);
  }

  // Create path from points
  if (points.length === 0) return '';

  let pathData = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    pathData += ` L ${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)}`;
  }

  return pathData;
}

function generateInkblot(
  addr: string,
  centerX: number,
  centerY: number,
  size: number,
  steps: number
): string {
  // Simulate boiling water with bubble nucleation and collision physics
  const points: Array<[number, number]> = [];

  // Bubble nucleation sites (2-4 per account)
  const nucleationCount = 2 + (hashToNumber(addr, 5000) % 3);

  interface Bubble {
    x: number;
    y: number;
    radius: number;
    vx: number;
    vy: number;
  }

  const bubbles: Bubble[] = [];

  // Create nucleation sites
  for (let n = 0; n < nucleationCount; n++) {
    bubbles.push({
      x: 40 + (hashToNumber(addr, 6000 + n) % 120),
      y: 40 + (hashToNumber(addr, 6100 + n) % 120),
      radius: 3 + (hashToNumber(addr, 6200 + n) % 5),
      vx: ((hashToNumber(addr, 6300 + n) % 20) - 10) * 0.1,
      vy: -0.5 - (hashToNumber(addr, 6400 + n) % 10) * 0.1 // Rising
    });
  }

  // Simulate bubble growth and movement
  const simSteps = 60;
  for (let step = 0; step < simSteps; step++) {
    // Grow bubbles
    for (let b = 0; b < bubbles.length; b++) {
      bubbles[b].radius += 0.15;
      bubbles[b].radius = Math.min(bubbles[b].radius, 25); // Cap size
    }

    // Move bubbles with velocity
    for (let b = 0; b < bubbles.length; b++) {
      bubbles[b].x += bubbles[b].vx;
      bubbles[b].y += bubbles[b].vy;
    }

    // Handle bubble collisions (ricocheting)
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const dx = bubbles[j].x - bubbles[i].x;
        const dy = bubbles[j].y - bubbles[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = bubbles[i].radius + bubbles[j].radius;

        if (dist < minDist) {
          // Collision - push apart
          const angle = Math.atan2(dy, dx);
          const overlap = minDist - dist;
          bubbles[i].x -= (overlap / 2) * Math.cos(angle);
          bubbles[i].y -= (overlap / 2) * Math.sin(angle);
          bubbles[j].x += (overlap / 2) * Math.cos(angle);
          bubbles[j].y += (overlap / 2) * Math.sin(angle);

          // Bounce velocities
          bubbles[i].vx -= 0.2 * Math.cos(angle);
          bubbles[i].vy -= 0.2 * Math.sin(angle);
          bubbles[j].vx += 0.2 * Math.cos(angle);
          bubbles[j].vy += 0.2 * Math.sin(angle);
        }
      }
    }

    // Handle circular border bouncing
    const borderRadius = 95;
    for (let b = 0; b < bubbles.length; b++) {
      const distFromCenter = Math.sqrt(bubbles[b].x ** 2 + bubbles[b].y ** 2);
      const maxDist = borderRadius - bubbles[b].radius;

      if (distFromCenter > maxDist) {
        // Bounce off circular border
        const angle = Math.atan2(bubbles[b].y, bubbles[b].x);
        bubbles[b].x = 100 + maxDist * Math.cos(angle);
        bubbles[b].y = 100 + maxDist * Math.sin(angle);
        bubbles[b].vx *= -0.8;
        bubbles[b].vy *= -0.8;
      }
    }
  }

  // Trace outline of all bubbles by sampling their perimeter
  const outlineSteps = 360;
  for (let i = 0; i < outlineSteps; i++) {
    const angle = (i / outlineSteps) * Math.PI * 2;

    // Find the furthest point on this ray that's inside a bubble
    let maxDist = 0;
    for (let b = 0; b < bubbles.length; b++) {
      // Distance from ray origin to bubble center
      const dx = bubbles[b].x - 100;
      const dy = bubbles[b].y - 100;
      const centerDist = Math.sqrt(dx * dx + dy * dy);
      const centerAngle = Math.atan2(dy, dx);
      const angleDiff = angle - centerAngle;

      // Project bubble center onto this ray and find edge
      const projDist = centerDist * Math.cos(angleDiff);
      if (projDist > 0) {
        // Point on edge of bubble along this ray
        const edgeDist = projDist + bubbles[b].radius;
        maxDist = Math.max(maxDist, edgeDist);
      }
    }

    // Add point at outline distance
    if (maxDist > 0) {
      const x = 100 + maxDist * Math.cos(angle);
      const y = 100 + maxDist * Math.sin(angle);
      points.push([x, y]);
    }
  }

  // Create closed path
  return createSmoothClosedPath(points);
}

function createSmoothClosedPath(points: Array<[number, number]>): string {
  if (points.length < 3) return '';

  // Create convex hull-like shape by sorting points around centroid
  const centroidX = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const centroidY = points.reduce((sum, p) => sum + p[1], 0) / points.length;

  // Sort points by angle from centroid
  const sortedPoints = points.sort((a, b) => {
    const angleA = Math.atan2(a[1] - centroidY, a[0] - centroidX);
    const angleB = Math.atan2(b[1] - centroidY, b[0] - centroidX);
    return angleA - angleB;
  });

  // Remove very close duplicates only (0.1px threshold)
  const uniquePoints: Array<[number, number]> = [];
  let lastPoint: [number, number] | null = null;

  for (const point of sortedPoints) {
    if (
      !lastPoint ||
      Math.abs(point[0] - lastPoint[0]) > 0.1 ||
      Math.abs(point[1] - lastPoint[1]) > 0.1
    ) {
      uniquePoints.push([point[0], point[1]]);
      lastPoint = point;
    }
  }

  if (uniquePoints.length < 3) return '';

  // Create direct linear path (no smoothing - keeps jagged organic feel)
  let pathData = `M ${Math.round(uniquePoints[0][0])} ${Math.round(uniquePoints[0][1])}`;

  for (let i = 1; i < uniquePoints.length; i++) {
    pathData += ` L ${Math.round(uniquePoints[i][0])} ${Math.round(uniquePoints[i][1])}`;
  }

  pathData += ' Z';
  return pathData;
}


function colorToString(color: Color): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/**
 * Convert SVG string to data URL for use in img src
 */
export function avatarToDataURL(svg: string): string {
  const encodedSvg = encodeURIComponent(svg);
  return `data:image/svg+xml,${encodedSvg}`;
}

/**
 * Get avatar data URL directly from address
 */
export function getAvatarDataURL(address: string): string {
  const svg = generateAvatarSVG(address);
  return avatarToDataURL(svg);
}
