import NylasWindow from './nylas-window'

const DEBUG_SHOW_HOT_WINDOW = true;

/**
 * It takes a full second or more to bootup a Nylas window. Most of this
 * is due to sheer amount of time it takes to parse all of the javascript
 * and follow the require tree.
 *
 * Since popout windows need to be more responsive than that, we pre-load
 * "hot" windows in the background that have most of the code loaded. Then
 * all we need to do is load the handful of packages the window
 * requires and show it.
 */
export default class WindowLauncher {
  static EMPTY_WINDOW = "emptyWindow"

  constructor(appOpts) {
    this.defaultWindowOpts = {
      frame: process.platform !== "darwin",
      hidden: false,
      toolbar: true,
      devMode: appOpts.devMode,
      safeMode: appOpts.safeMode,
      resizable: true,
      windowType: WindowLauncher.EMPTY_WINDOW,
      resourcePath: appOpts.resourcePath,
      configDirPath: appOpts.configDirPath,
    }
    this.hotWindow = new NylasWindow(this._hotWindowOpts());

    if (DEBUG_SHOW_HOT_WINDOW) {
      this.hotWindow.showWhenLoaded()
    }
  }

  newWindow(options) {
    const opts = Object.assign({}, this.defaultWindowOpts, options);
    let win;
    if (opts.bootstrapScript) {
      win = new NylasWindow(opts)
    } else {
      opts.bootstrapScript = this._secondaryWindowBootstrap()
      if (this._unableToModifyHotWindow(opts) || opts.coldStartOnly) {
        // Useful for the Worker Window: A secondary window that shouldn't
        // be hot-loaded
        win = new NylasWindow(opts)
      } else {
        win = this.hotWindow;

        // Regenerate the hot window.
        this.hotWindow = new NylasWindow(this._hotWindowOpts());
        if (DEBUG_SHOW_HOT_WINDOW) {
          this.hotWindow.showWhenLoaded()
        }

        const newLoadSettings = Object.assign({}, win.loadSettings(), opts)
        if (newLoadSettings.windowType === WindowLauncher.EMPTY_WINDOW) {
          throw new Error("Must specify a windowType")
        }

        // Reset the loaded state and update the load settings.
        // This will fire `NylasEnv::populateHotWindow` and reload the
        // packages.
        win.setLoadSettings(newLoadSettings);
      }
    }
    if (!opts.hidden) {
      // NOTE: In the case of a cold window, this will show it once
      // loaded. If it's a hotWindow, since hotWindows have a
      // `hidden:true` flag, nothing will show. When `setLoadSettings`
      // starts populating the window in `populateHotWindow` we'll show or
      // hide based on the windowOpts
      win.showWhenLoaded()
    }
    return win
  }

  // Note: This method calls `browserWindow.destroy()` which closes
  // windows without waiting for them to load or firing window lifecycle
  // events.  This is necessary for the app to quit promptly on Linux.
  // https://phab.nylas.com/T1282
  cleanupBeforeAppQuit() {
    this.hotWindow.browserWindow.destroy()
  }

  // Some properties, like the `frame` or `toolbar` can't be updated once
  // a window has been setup. If we detect this case we have to bootup a
  // plain NylasWindow instead of using a hot window.
  _unableToModifyHotWindow(opts) {
    return this.defaultWindowOpts.frame !== (!!opts.frame)
  }

  _secondaryWindowBootstrap() {
    if (!this._bootstrap) {
      this._bootstrap = require.resolve("../secondary-window-bootstrap")
    }
    return this._bootstrap
  }

  _hotWindowOpts() {
    const hotWindowOpts = Object.assign({}, this.defaultWindowOpts);
    hotWindowOpts.packageLoadingDeferred = true;
    hotWindowOpts.bootstrapScript = this._secondaryWindowBootstrap();
    hotWindowOpts.hidden = DEBUG_SHOW_HOT_WINDOW;
    return hotWindowOpts
  }
}
