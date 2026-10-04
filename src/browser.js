import { spawn } from 'child_process';

// The command that opens `url` in Google Chrome on the given platform.
export function chromeLaunchCommand(platform, url) {
  if (platform === 'win32') {
    // `start` finds chrome.exe through the App Paths registry key; the empty
    // string is the window title `start` expects before the program name.
    return { command: 'cmd', args: ['/c', 'start', '', 'chrome', url] };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', 'Google Chrome', url] };
  }
  return { command: 'google-chrome', args: [url] };
}

// Best effort: a missing Chrome must never take the server down.
export function openInChrome(url) {
  const { command, args } = chromeLaunchCommand(process.platform, url);
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', err => console.warn(`Could not open Chrome: ${err.message}`));
    child.unref();
  } catch (err) {
    console.warn(`Could not open Chrome: ${err.message}`);
  }
}
