import { Header } from './common';
import { useApp } from '../app';

export function HelpPage() {
  const { settings, store } = useApp();
  return (
    <>
      <Header title="Help" back />
      <div class="card">
        <h3>Hidden looks</h3>
        <p class="hint">If you accidentally hid a look, tap below to restore all hidden looks.</p>
        <button
          class="chip"
          disabled={!(settings.hiddenLooks?.length ?? 0)}
          onClick={() => store.update('hiddenLooks', [])}
        >
          Reset hidden looks ({settings.hiddenLooks?.length ?? 0})
        </button>
      </div>
      <div class="section">
        <h2>🏠 Home</h2>
        <p>
          Tap a look to apply it. The power switch and brightness slider control the lights. Recent
          looks appear at the top.
        </p>
        <p>
          <b>Keyboard:</b> Space = toggle power, ←/→ = cycle looks, 1-9 = quick pick.
        </p>

        <h2>🎨 Make a look</h2>
        <p>
          Choose an effect style, colors, and a color theme. Target specific zones or the whole
          house. Add multiple layers for different effects on different parts.
        </p>
        <p>📋 Export copies the look to clipboard. 📥 Import reads from clipboard.</p>

        <h2>🏠 House zones</h2>
        <p>
          Define the parts of your house (roofline, garage, peaks). Set total pixels, spacing (every
          2nd, 3rd, etc.), and manual positions for scattered lights.
        </p>
        <p>Transition slider controls fade time between looks.</p>

        <h2>⏰ Schedule</h2>
        <p>
          Set on/off times with sunrise/sunset support. Multiple windows, different days. Saving
          replaces WLED's timers.
        </p>
        <p>Set a location (zip or coordinates) for sunrise/sunset and weather rules.</p>

        <h2>🗓 Autopilot</h2>
        <p>
          Seasonal looks by date (holidays, birthdays, game days). Everyday look for the rest of the
          year. Weather rules override based on current conditions.
        </p>

        <h2>🎬 Shows</h2>
        <p>
          Choreograph timed sequences of looks. Each step applies a look for a set duration. Loop or
          play once.
        </p>

        <h2>🍭 Props</h2>
        <p>
          Control candy canes, path lights, and trees on other WLED controllers. Sync all
          controllers with one tap.
        </p>

        <h2>🏠 Backup</h2>
        <p>
          House zones → Backup. Download all settings to your device. Restore from a file later.
        </p>

        <h2>⚙️ Theme</h2>
        <p>Tap ⚙️/🌙/☀️ in the Home header to cycle auto → dark → light → auto.</p>

        <h2>💡 Tips</h2>
        <ul>
          <li>
            Hide looks you don't use with ✕ on each tile. Tap "Show hidden" to bring them back.
          </li>
          <li>Tap 🗑 on a look tile's ✎ editor to delete custom looks.</li>
          <li>
            Guest mode: add <code>?view=1</code> to the URL for read-only access.
          </li>
          <li>Energy estimate shows below the brightness slider (from controller or estimated).</li>
        </ul>
      </div>
    </>
  );
}
