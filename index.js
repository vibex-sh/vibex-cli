import readline from 'readline';
import { io } from 'socket.io-client';
import { program, Command } from 'commander';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, 'package.json');
let cliVersion = '0.0.0';
try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  cliVersion = packageJson.version || '0.0.0';
} catch (error) {
  // Fallback if package.json can't be read - try to read from parent directory
  try {
    const parentPackageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(parentPackageJsonPath, 'utf8'));
    cliVersion = packageJson.version || '0.0.0';
  } catch (e) {
    // If both fail, use default
  }
}

import crypto from 'crypto';

function generateSessionId() {
  // Generate secure random session ID with 12 characters (as per security plan)
  // Format: vibex-{12 random alphanumeric chars}
  // Using crypto for better randomness
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'vibex-';
  
  // Use crypto.randomBytes for cryptographically secure random generation
  const randomBytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  
  return result;
}

function normalizeSessionId(sessionId) {
  if (!sessionId) return null;
  // If it doesn't start with 'vibex-', add it
  if (!sessionId.startsWith('vibex-')) {
    return `vibex-${sessionId}`;
  }
  return sessionId;
}

function deriveSocketUrl(webUrl) {
  const url = new URL(webUrl);
  
  // For localhost, socket is typically on port 3001
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    const port = url.port === '3000' || !url.port ? '3001' : String(parseInt(url.port) + 1);
    return `${url.protocol}//${url.hostname}:${port}`;
  } 
  // For vibex.sh domains, use socket subdomain
  else if (url.hostname.includes('vibex.sh')) {
    return webUrl.replace(url.hostname, `socket.${url.hostname}`);
  } 
  // For other domains, try to use socket subdomain
  else {
    return webUrl.replace(url.hostname, `socket.${url.hostname}`);
  }
}

function getUrls(options) {
  const { local, web, socket, server } = options;
  
  // Priority 1: Explicit --web and --socket flags (highest priority)
  if (web) {
    return {
      webUrl: web,
      socketUrl: socket || deriveSocketUrl(web),
    };
  }
  
  // Priority 2: --server flag (shorthand for --web)
  if (server) {
    return {
      webUrl: server,
      socketUrl: socket || deriveSocketUrl(server),
    };
  }
  
  // Priority 3: --local flag
  if (local) {
    return {
      webUrl: process.env.VIBEX_WEB_URL || 'http://localhost:3000',
      socketUrl: process.env.VIBEX_SOCKET_URL || socket || 'http://localhost:3001',
    };
  }
  
  // Priority 4: Environment variables
  if (process.env.VIBEX_WEB_URL) {
    return {
      webUrl: process.env.VIBEX_WEB_URL,
      socketUrl: process.env.VIBEX_SOCKET_URL || socket || deriveSocketUrl(process.env.VIBEX_WEB_URL),
    };
  }
  
  // Priority 5: Production defaults
  return {
    webUrl: 'https://vibex.sh',
    socketUrl: socket || 'https://socket.vibex.sh',
  };
}

function getConfigPath() {
  // Check for custom config path from environment variable
  if (process.env.VIBEX_CONFIG_PATH) {
    return process.env.VIBEX_CONFIG_PATH;
  }
  // Default: ~/.vibex/config.json
  const configDir = join(homedir(), '.vibex');
  return join(configDir, 'config.json');
}

async function getStoredToken() {
  try {
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      return config.token || null;
    }
  } catch (error) {
    // Ignore errors (file doesn't exist or invalid JSON)
  }
  return null;
}

function getStoredConfig() {
  try {
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch (error) {
    // Ignore errors
  }
  return null;
}

async function storeToken(token, webUrl = null) {
  try {
    const configPath = getConfigPath();
    const configDir = join(homedir(), '.vibex');
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
    }
    
    const config = {
      token,
      ...(webUrl && { webUrl }), // Store webUrl if provided
      updatedAt: new Date().toISOString(),
    };
    
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to store token:', error.message);
    return false;
  }
}

async function handleLogin(webUrl) {
  const configPath = getConfigPath();
  const existingConfig = getStoredConfig();
  
  console.log('\n  🔐 vibex.sh CLI Authentication\n');
  console.log(`  📁 Config location: ${configPath}`);
  
  if (existingConfig?.token) {
    console.log(`  ⚠️  You already have a token stored. This will replace it.\n`);
  }
  
  const tempToken = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const authUrl = `${webUrl}/api/cli-auth?token=${tempToken}`;
  
  console.log('  Opening browser for authentication...\n');
  console.log(`  If browser doesn't open, visit: ${authUrl}\n`);
  
  // Open browser
  const platform = process.platform;
  let command;
  if (platform === 'darwin') {
    command = 'open';
  } else if (platform === 'win32') {
    command = 'start';
  } else {
    command = 'xdg-open';
  }
  
  spawn(command, [authUrl], { detached: true, stdio: 'ignore' });
  
  // Poll for token
  console.log('  Waiting for authentication...');
  const maxAttempts = 60; // 60 seconds
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
    
    try {
      const response = await httpRequest(`${webUrl}/api/cli-auth?token=${tempToken}`, {
        method: 'GET',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.token) {
          await storeToken(data.token, webUrl);
          const configPath = getConfigPath();
          console.log('\n  ✅ Authentication successful!');
          console.log(`  📁 Token saved to: ${configPath}`);
          console.log(`  💡 This token will be used automatically for future commands.\n`);
          return data.token;
        }
      }
    } catch (error) {
      // Continue polling
    }
  }
  
  console.log('\n  ⏱️  Authentication timeout. Please try again.\n');
  process.exit(1);
}

function httpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const req = httpModule.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(parsed) });
        } catch (e) {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve({}) });
        }
      });
    });
    
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function claimSession(sessionId, token, webUrl) {
  if (!token) return null; // Return null instead of false to indicate no claim attempted
  
  try {
    // Normalize session ID before claiming
    const normalizedSessionId = normalizeSessionId(sessionId);
    const response = await httpRequest(`${webUrl}/api/auth/claim-session-with-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: normalizedSessionId,
        token,
      }),
    });
    
    if (response.ok) {
      // Parse response to get auth code
      const responseData = await response.json();
      return responseData.authCode || null;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Removed getSessionAuthCode - auth codes should only come from:
// 1. claim-session-with-token response (for claimed sessions)
// 2. socket.io session-auth-code event (for unclaimed sessions)
// Never fetch auth codes via public API endpoint - security vulnerability 

function printBanner(sessionId, webUrl, authCode = null) {
  const dashboardUrl = authCode 
    ? `${webUrl}/${sessionId}?auth=${authCode}`
    : `${webUrl}/${sessionId}`;
  
  console.log('\n');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║         🔍 vibex.sh is watching...    ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('\n');
  console.log(`  Session ID: ${sessionId}`);
  if (authCode) {
    console.log(`  Auth Code:  ${authCode}`);
  }
  console.log(`  Dashboard:  ${dashboardUrl}`);
  console.log('\n');
}

async function main() {
  // Handle --version flag early (before commander parses)
  const allArgs = process.argv;
  const args = process.argv.slice(2);
  
  // Check for --version or -V flag
  if (allArgs.includes('--version') || allArgs.includes('-V') || args.includes('--version') || args.includes('-V')) {
    console.log(cliVersion);
    process.exit(0);
  }
  
  // Handle login command separately - check BEFORE commander parses
  // Check process.argv directly - look for 'login' as a standalone argument
  // This must happen FIRST, before any commander parsing
  // Check if 'login' appears anywhere in process.argv (works with npx too)
  const hasLogin = allArgs.includes('login') || args.includes('login');
  
  if (hasLogin) {
    // Find login position to get args after it
    const loginIndex = args.indexOf('login');
    const loginArgs = loginIndex !== -1 ? args.slice(loginIndex + 1) : [];
    
    // Create a separate command instance for login
    const loginCmd = new Command();
    loginCmd
      .option('-l, --local', 'Use localhost')
      .option('--web <url>', 'Web server URL')
      .option('--server <url>', 'Shorthand for --web');
    
    // Parse only the options (args after 'login')
    if (loginArgs.length > 0) {
      loginCmd.parse(['node', 'vibex', ...loginArgs], { from: 'user' });
    } else {
      loginCmd.parse(['node', 'vibex'], { from: 'user' });
    }
    
    const options = loginCmd.opts();
    const { webUrl } = getUrls(options);
    await handleLogin(webUrl);
    process.exit(0);
  }

  program
    .version(cliVersion, '-v, --version', 'Display version number')
    .option('-s, --session-id <id>', 'Reuse existing session ID')
    .option('-l, --local', 'Use localhost (web: 3000, socket: 3001)')
    .option('--web <url>', 'Web server URL (e.g., http://localhost:3000)')
    .option('--socket <url>', 'Socket server URL (e.g., http://localhost:3001)')
    .option('--server <url>', 'Shorthand for --web (auto-derives socket URL)')
    .option('--token <token>', 'Authentication token (or use VIBEX_TOKEN env var)')
    .parse();

  const options = program.opts();

  // Normalize session ID - add 'vibex-' prefix if missing
  const rawSessionId = options.sessionId || generateSessionId();
  const sessionId = normalizeSessionId(rawSessionId);
  const { webUrl, socketUrl } = getUrls(options);
  
  // Get token from flag, env var, or stored config
  let token = options.token || process.env.VIBEX_TOKEN || await getStoredToken();
  
  // Auto-claim session if token is available and fetch auth code
  let authCode = null;
  if (token) {
    // Try to claim session (works for both new and existing sessions)
    // For new sessions, this will create and claim
    // For existing sessions, this will return the auth code if user owns it
    authCode = await claimSession(sessionId, token, webUrl);
    if (authCode && !options.sessionId) {
      // Only show claim message for new sessions
      console.log('  ✓ Session automatically claimed to your account\n');
    }
  }
  
  // For unclaimed sessions, auth code will come from socket.io 'session-auth-code' event
  // We'll set it when we receive it from the socket

  // Print banner only once, and show how to reuse session
  if (!options.sessionId) {
    printBanner(sessionId, webUrl, authCode);
    const localFlag = webUrl.includes('localhost') ? ' --local' : '';
    const sessionSlug = sessionId.replace(/^vibex-/, ''); // Remove prefix for example
    console.log('  💡 Tip: Use -s to send more logs to this session');
    console.log(`  Example: echo '{"cpu": 45, "memory": 78}' | npx vibex-sh -s ${sessionSlug}${localFlag}\n`);
  } else {
    // When reusing a session, show minimal info (no auth code)
    console.log(`  🔍 Sending logs to session: ${sessionId}\n`);
  }

  const socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    // Reconnection settings for Cloud Run
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity, // Keep trying forever
    timeout: 20000,
  });

  let isConnected = false;
  let hasJoinedSession = false;
  const logQueue = [];

  // Store auth code received from socket
  let receivedAuthCode = authCode;
  
  // Track if this is a new session (not reusing an existing one)
  const isNewSession = !options.sessionId;

  socket.on('connect', () => {
    isConnected = true;
    console.log('  ✓ Connected to server\n');
    // Rejoin session on reconnect
    socket.emit('join-session', sessionId);
    // Wait a tiny bit for join-session to be processed
    setTimeout(() => {
      hasJoinedSession = true;
      // Process any queued logs
      while (logQueue.length > 0) {
        const logData = logQueue.shift();
        socket.emit('cli-emit', {
          sessionId,
          ...logData,
        });
      }
    }, 100);
  });

  // Listen for auth code from socket.io (for unclaimed sessions)
  // Only display auth code if this is a new session (not when reusing existing session)
  socket.on('session-auth-code', (data) => {
    if (data.sessionId === sessionId && data.authCode) {
      // Update received auth code
      if (!receivedAuthCode || receivedAuthCode !== data.authCode) {
        receivedAuthCode = data.authCode;
        // Only display auth code for new sessions, not when reusing existing sessions
        if (isNewSession) {
          console.log(`  🔑 Auth Code: ${receivedAuthCode}`);
          console.log(`  📋 Dashboard: ${webUrl}/${sessionId}?auth=${receivedAuthCode}\n`);
        }
      }
    }
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log(`  ↻ Reconnected (attempt ${attemptNumber})\n`);
    isConnected = true;
    // Rejoin session after reconnection
    socket.emit('join-session', sessionId);
    setTimeout(() => {
      hasJoinedSession = true;
      // Process any queued logs
      while (logQueue.length > 0) {
        const logData = logQueue.shift();
        socket.emit('cli-emit', {
          sessionId,
          ...logData,
        });
      }
    }, 100);
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    // Silent reconnection attempts - don't spam console
  });

  socket.on('reconnect_error', (error) => {
    // Silent reconnection errors - will keep trying
  });

  socket.on('reconnect_failed', () => {
    console.error('  ✗ Failed to reconnect after all attempts');
    console.error('  Stream will continue, but logs may be lost until reconnection\n');
  });

  socket.on('connect_error', (error) => {
    // Don't exit on first connection error - allow reconnection
    if (!isConnected) {
      console.error('  ✗ Connection error:', error.message);
      console.error('  ↻ Retrying connection...\n');
    }
  });

  socket.on('disconnect', (reason) => {
    isConnected = false;
    hasJoinedSession = false;
    // Don't exit - allow reconnection
    if (reason === 'io server disconnect') {
      // Server disconnected, will reconnect automatically
    }
  });

  // Handle rate limit errors from server
  socket.on('rate-limit-exceeded', (data) => {
    console.error('\n  ⚠️  Rate Limit Exceeded');
    console.error(`  ${data.message || 'Too many requests. Please try again later.'}`);
    if (data.rateLimit) {
      const { limit, remaining, resetAt, windowSeconds } = data.rateLimit;
      if (limit !== undefined) {
        console.error(`  Limit: ${limit} requests`);
      }
      if (remaining !== undefined) {
        console.error(`  Remaining: ${remaining} requests`);
      }
      if (resetAt) {
        const resetDate = new Date(resetAt);
        const now = new Date();
        const secondsUntilReset = Math.ceil((resetDate - now) / 1000);
        if (secondsUntilReset > 0) {
          console.error(`  Resets in: ${secondsUntilReset} seconds`);
        }
      }
    }
    console.error('');
    // Don't exit - let user decide, but clear the queue
    logQueue.length = 0;
  });

  // Handle general errors from server
  socket.on('error', (data) => {
    // Check if it's a history limit error
    if (data && data.error === 'History Limit Reached') {
      console.error('\n  🚫 History Limit Reached');
      console.error(`  ${data.message || 'Session history limit reached'}`);
      if (data.limit !== undefined && data.current !== undefined) {
        console.error(`  Current: ${data.current} / ${data.limit} logs`);
      }
      if (data.upgradeRequired) {
        console.error('  💡 Upgrade to Pro to unlock 30 days retention');
        console.error('  🌐 Visit: https://vibex.sh/pricing');
      }
      console.error('');
      // Clear the queue and stop processing
      logQueue.length = 0;
      hasJoinedSession = false; // Prevent further logs from being sent
      return;
    }
    
    // Handle other errors
    console.error('\n  ✗ Server Error');
    if (typeof data === 'string') {
      console.error(`  ${data}`);
    } else if (data && data.message) {
      console.error(`  ${data.message}`);
      if (data.error) {
        console.error(`  Error: ${data.error}`);
      }
    } else {
      console.error('  An unexpected error occurred');
    }
    console.error('');
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return;
    }

    let logData;
    try {
      const parsed = JSON.parse(trimmedLine);
      logData = {
        type: 'json',
        payload: parsed,
        timestamp: Date.now(),
      };
    } catch (e) {
      logData = {
        type: 'text',
        payload: trimmedLine,
        timestamp: Date.now(),
      };
    }

    // If connected and joined session, send immediately; otherwise queue it
    if (isConnected && hasJoinedSession && socket.connected) {
      socket.emit('cli-emit', {
        sessionId,
        ...logData,
      });
    } else {
      logQueue.push(logData);
    }
  });

  rl.on('close', () => {
    // Wait for connection and queued logs to be sent
    const waitForQueue = () => {
      if (logQueue.length === 0 || (!isConnected && logQueue.length > 0)) {
        // If not connected and we have queued logs, wait a bit more
        if (!isConnected && logQueue.length > 0) {
          setTimeout(waitForQueue, 200);
          return;
        }
        console.log('\n  Stream ended. Closing connection...\n');
        if (socket.connected) {
          socket.disconnect();
        }
        setTimeout(() => process.exit(0), 100);
      } else {
        setTimeout(waitForQueue, 100);
      }
    };
    
    waitForQueue();
  });

  process.on('SIGINT', () => {
    console.log('\n  Interrupted. Closing connection...\n');
    socket.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

