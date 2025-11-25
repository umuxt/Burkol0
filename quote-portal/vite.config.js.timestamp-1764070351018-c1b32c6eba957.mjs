// vite.config.js
import { defineConfig } from "file:///Users/umutyalcin/Documents/Burkol0/quote-portal/node_modules/vite/dist/node/index.js";
import react from "file:///Users/umutyalcin/Documents/Burkol0/quote-portal/node_modules/@vitejs/plugin-react/dist/index.js";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";
var __vite_injected_original_dirname = "/Users/umutyalcin/Documents/Burkol0/quote-portal";
var copyComponents = () => {
  return {
    name: "copy-components",
    generateBundle() {
      const componentsDir = resolve(__vite_injected_original_dirname, "dist/components");
      if (!existsSync(componentsDir)) {
        mkdirSync(componentsDir, { recursive: true });
      }
      const componentFiles = ["BurkolNavigation.js", "AuthGuard.js"];
      componentFiles.forEach((file) => {
        const sourcePath = resolve(__vite_injected_original_dirname, `components/${file}`);
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, resolve(__vite_injected_original_dirname, `dist/components/${file}`));
        }
      });
      const jsFiles = [
        "domains/admin/settings-app.js",
        "public/sw.js"
      ];
      jsFiles.forEach((file) => {
        const sourcePath = resolve(__vite_injected_original_dirname, file);
        const destPath = resolve(__vite_injected_original_dirname, `dist/${file}`);
        if (existsSync(sourcePath)) {
          const destDir = destPath.substring(0, destPath.lastIndexOf("/"));
          if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
          }
          copyFileSync(sourcePath, destPath);
        }
      });
      const manifestPath = resolve(__vite_injected_original_dirname, "config/manifest.json");
      if (existsSync(manifestPath)) {
        copyFileSync(manifestPath, resolve(__vite_injected_original_dirname, "dist/manifest.json"));
      }
      const imgSourceDir = resolve(__vite_injected_original_dirname, "img");
      const imgDestDir = resolve(__vite_injected_original_dirname, "dist/img");
      if (existsSync(imgSourceDir)) {
        if (!existsSync(imgDestDir)) {
          mkdirSync(imgDestDir, { recursive: true });
        }
        const imgFiles = ["filter-icon.png", "info.png"];
        imgFiles.forEach((file) => {
          const sourcePath = resolve(imgSourceDir, file);
          if (existsSync(sourcePath)) {
            copyFileSync(sourcePath, resolve(imgDestDir, file));
          }
        });
      }
    }
  };
};
var vite_config_default = defineConfig({
  plugins: [react(), copyComponents()],
  server: {
    port: 3001,
    host: "localhost",
    // Listen only on localhost for faster startup
    hmr: {
      port: 3001,
      overlay: true
      // Enable error overlay to see issues
    },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false
      }
    },
    // Multi-page application HTML routing
    middlewareMode: false,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.endsWith(".html") && !req.url.includes("/@") && !req.url.includes("vite")) {
          let htmlPath = req.url;
          if (!req.url.startsWith("/pages/")) {
            const pageMap = {
              "/login.html": "/pages/login.html",
              "/admin-dashboard.html": "/pages/admin-dashboard.html",
              "/quote-dashboard.html": "/pages/quote-dashboard.html",
              "/materials.html": "/pages/materials.html",
              "/production.html": "/pages/production.html",
              "/settings.html": "/pages/settings.html"
            };
            htmlPath = pageMap[req.url] || req.url;
          }
          console.log(`[VITE] HTML Request: ${req.url} \u2192 ${htmlPath}`);
          req.url = htmlPath;
        }
        next();
      });
    }
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__vite_injected_original_dirname, "index.html"),
        login: resolve(__vite_injected_original_dirname, "pages/login.html"),
        admin: resolve(__vite_injected_original_dirname, "pages/quote-dashboard.html"),
        adminDashboard: resolve(__vite_injected_original_dirname, "pages/admin-dashboard.html"),
        materials: resolve(__vite_injected_original_dirname, "pages/materials.html"),
        production: resolve(__vite_injected_original_dirname, "pages/production.html"),
        settings: resolve(__vite_injected_original_dirname, "pages/settings.html")
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvdW11dHlhbGNpbi9Eb2N1bWVudHMvQnVya29sMC9xdW90ZS1wb3J0YWxcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy91bXV0eWFsY2luL0RvY3VtZW50cy9CdXJrb2wwL3F1b3RlLXBvcnRhbC92aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvdW11dHlhbGNpbi9Eb2N1bWVudHMvQnVya29sMC9xdW90ZS1wb3J0YWwvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgeyBjb3B5RmlsZVN5bmMsIG1rZGlyU3luYywgZXhpc3RzU3luYyB9IGZyb20gJ2ZzJ1xuXG4vLyBDdXN0b20gcGx1Z2luIHRvIGNvcHkgY29tcG9uZW50c1xuY29uc3QgY29weUNvbXBvbmVudHMgPSAoKSA9PiB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogJ2NvcHktY29tcG9uZW50cycsXG4gICAgZ2VuZXJhdGVCdW5kbGUoKSB7XG4gICAgICBjb25zdCBjb21wb25lbnRzRGlyID0gcmVzb2x2ZShfX2Rpcm5hbWUsICdkaXN0L2NvbXBvbmVudHMnKVxuICAgICAgaWYgKCFleGlzdHNTeW5jKGNvbXBvbmVudHNEaXIpKSB7XG4gICAgICAgIG1rZGlyU3luYyhjb21wb25lbnRzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBDb3B5IGNvbXBvbmVudHNcbiAgICAgIGNvbnN0IGNvbXBvbmVudEZpbGVzID0gWydCdXJrb2xOYXZpZ2F0aW9uLmpzJywgJ0F1dGhHdWFyZC5qcyddXG4gICAgICBjb21wb25lbnRGaWxlcy5mb3JFYWNoKGZpbGUgPT4ge1xuICAgICAgICBjb25zdCBzb3VyY2VQYXRoID0gcmVzb2x2ZShfX2Rpcm5hbWUsIGBjb21wb25lbnRzLyR7ZmlsZX1gKVxuICAgICAgICBpZiAoZXhpc3RzU3luYyhzb3VyY2VQYXRoKSkge1xuICAgICAgICAgIGNvcHlGaWxlU3luYyhzb3VyY2VQYXRoLCByZXNvbHZlKF9fZGlybmFtZSwgYGRpc3QvY29tcG9uZW50cy8ke2ZpbGV9YCkpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBcbiAgICAgIC8vIENvcHkgZXNzZW50aWFsIEpTIGZpbGVzXG4gICAgICBjb25zdCBqc0ZpbGVzID0gW1xuICAgICAgICAnZG9tYWlucy9hZG1pbi9zZXR0aW5ncy1hcHAuanMnLFxuICAgICAgICAncHVibGljL3N3LmpzJ1xuICAgICAgXVxuICAgICAgXG4gICAgICBqc0ZpbGVzLmZvckVhY2goZmlsZSA9PiB7XG4gICAgICAgIGNvbnN0IHNvdXJjZVBhdGggPSByZXNvbHZlKF9fZGlybmFtZSwgZmlsZSlcbiAgICAgICAgY29uc3QgZGVzdFBhdGggPSByZXNvbHZlKF9fZGlybmFtZSwgYGRpc3QvJHtmaWxlfWApXG4gICAgICAgIFxuICAgICAgICBpZiAoZXhpc3RzU3luYyhzb3VyY2VQYXRoKSkge1xuICAgICAgICAgIC8vIENyZWF0ZSBkaXJlY3RvcnkgaWYgaXQgZG9lc24ndCBleGlzdFxuICAgICAgICAgIGNvbnN0IGRlc3REaXIgPSBkZXN0UGF0aC5zdWJzdHJpbmcoMCwgZGVzdFBhdGgubGFzdEluZGV4T2YoJy8nKSlcbiAgICAgICAgICBpZiAoIWV4aXN0c1N5bmMoZGVzdERpcikpIHtcbiAgICAgICAgICAgIG1rZGlyU3luYyhkZXN0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBjb3B5RmlsZVN5bmMoc291cmNlUGF0aCwgZGVzdFBhdGgpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBcbiAgICAgIC8vIENvcHkgbWFuaWZlc3QuanNvbiBpZiBpdCBleGlzdHNcbiAgICAgIGNvbnN0IG1hbmlmZXN0UGF0aCA9IHJlc29sdmUoX19kaXJuYW1lLCAnY29uZmlnL21hbmlmZXN0Lmpzb24nKVxuICAgICAgaWYgKGV4aXN0c1N5bmMobWFuaWZlc3RQYXRoKSkge1xuICAgICAgICBjb3B5RmlsZVN5bmMobWFuaWZlc3RQYXRoLCByZXNvbHZlKF9fZGlybmFtZSwgJ2Rpc3QvbWFuaWZlc3QuanNvbicpKVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBDb3B5IGltZyBkaXJlY3RvcnlcbiAgICAgIGNvbnN0IGltZ1NvdXJjZURpciA9IHJlc29sdmUoX19kaXJuYW1lLCAnaW1nJylcbiAgICAgIGNvbnN0IGltZ0Rlc3REaXIgPSByZXNvbHZlKF9fZGlybmFtZSwgJ2Rpc3QvaW1nJylcbiAgICAgIGlmIChleGlzdHNTeW5jKGltZ1NvdXJjZURpcikpIHtcbiAgICAgICAgaWYgKCFleGlzdHNTeW5jKGltZ0Rlc3REaXIpKSB7XG4gICAgICAgICAgbWtkaXJTeW5jKGltZ0Rlc3REaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaW1nRmlsZXMgPSBbJ2ZpbHRlci1pY29uLnBuZycsICdpbmZvLnBuZyddXG4gICAgICAgIGltZ0ZpbGVzLmZvckVhY2goZmlsZSA9PiB7XG4gICAgICAgICAgY29uc3Qgc291cmNlUGF0aCA9IHJlc29sdmUoaW1nU291cmNlRGlyLCBmaWxlKVxuICAgICAgICAgIGlmIChleGlzdHNTeW5jKHNvdXJjZVBhdGgpKSB7XG4gICAgICAgICAgICBjb3B5RmlsZVN5bmMoc291cmNlUGF0aCwgcmVzb2x2ZShpbWdEZXN0RGlyLCBmaWxlKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKSwgY29weUNvbXBvbmVudHMoKV0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDMwMDEsXG4gICAgaG9zdDogJ2xvY2FsaG9zdCcsIC8vIExpc3RlbiBvbmx5IG9uIGxvY2FsaG9zdCBmb3IgZmFzdGVyIHN0YXJ0dXBcbiAgICBobXI6IHtcbiAgICAgIHBvcnQ6IDMwMDEsXG4gICAgICBvdmVybGF5OiB0cnVlIC8vIEVuYWJsZSBlcnJvciBvdmVybGF5IHRvIHNlZSBpc3N1ZXNcbiAgICB9LFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHtcbiAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICBzZWN1cmU6IGZhbHNlXG4gICAgICB9XG4gICAgfSxcbiAgICAvLyBNdWx0aS1wYWdlIGFwcGxpY2F0aW9uIEhUTUwgcm91dGluZ1xuICAgIG1pZGRsZXdhcmVNb2RlOiBmYWxzZSxcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XG4gICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgICAgICAvLyBIYW5kbGUgZGlyZWN0IEhUTUwgcGFnZSByZXF1ZXN0c1xuICAgICAgICBpZiAocmVxLnVybCAmJiByZXEudXJsLmVuZHNXaXRoKCcuaHRtbCcpICYmICFyZXEudXJsLmluY2x1ZGVzKCcvQCcpICYmICFyZXEudXJsLmluY2x1ZGVzKCd2aXRlJykpIHtcbiAgICAgICAgICBsZXQgaHRtbFBhdGggPSByZXEudXJsO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIE1hcCByb290LWxldmVsIEhUTUwgcmVxdWVzdHMgdG8gcGFnZXMgZGlyZWN0b3J5XG4gICAgICAgICAgaWYgKCFyZXEudXJsLnN0YXJ0c1dpdGgoJy9wYWdlcy8nKSkge1xuICAgICAgICAgICAgY29uc3QgcGFnZU1hcCA9IHtcbiAgICAgICAgICAgICAgJy9sb2dpbi5odG1sJzogJy9wYWdlcy9sb2dpbi5odG1sJyxcbiAgICAgICAgICAgICAgJy9hZG1pbi1kYXNoYm9hcmQuaHRtbCc6ICcvcGFnZXMvYWRtaW4tZGFzaGJvYXJkLmh0bWwnLFxuICAgICAgICAgICAgICAnL3F1b3RlLWRhc2hib2FyZC5odG1sJzogJy9wYWdlcy9xdW90ZS1kYXNoYm9hcmQuaHRtbCcsXG4gICAgICAgICAgICAgICcvbWF0ZXJpYWxzLmh0bWwnOiAnL3BhZ2VzL21hdGVyaWFscy5odG1sJyxcbiAgICAgICAgICAgICAgJy9wcm9kdWN0aW9uLmh0bWwnOiAnL3BhZ2VzL3Byb2R1Y3Rpb24uaHRtbCcsXG4gICAgICAgICAgICAgICcvc2V0dGluZ3MuaHRtbCc6ICcvcGFnZXMvc2V0dGluZ3MuaHRtbCdcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGh0bWxQYXRoID0gcGFnZU1hcFtyZXEudXJsXSB8fCByZXEudXJsO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBjb25zb2xlLmxvZyhgW1ZJVEVdIEhUTUwgUmVxdWVzdDogJHtyZXEudXJsfSBcdTIxOTIgJHtodG1sUGF0aH1gKTtcbiAgICAgICAgICByZXEudXJsID0gaHRtbFBhdGg7XG4gICAgICAgIH1cbiAgICAgICAgbmV4dCgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9LFxuICBidWlsZDoge1xuICAgIG91dERpcjogJ2Rpc3QnLFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIG1haW46IHJlc29sdmUoX19kaXJuYW1lLCAnaW5kZXguaHRtbCcpLFxuICAgICAgICBsb2dpbjogcmVzb2x2ZShfX2Rpcm5hbWUsICdwYWdlcy9sb2dpbi5odG1sJyksXG4gICAgICAgIGFkbWluOiByZXNvbHZlKF9fZGlybmFtZSwgJ3BhZ2VzL3F1b3RlLWRhc2hib2FyZC5odG1sJyksXG4gICAgICAgIGFkbWluRGFzaGJvYXJkOiByZXNvbHZlKF9fZGlybmFtZSwgJ3BhZ2VzL2FkbWluLWRhc2hib2FyZC5odG1sJyksXG4gICAgICAgIG1hdGVyaWFsczogcmVzb2x2ZShfX2Rpcm5hbWUsICdwYWdlcy9tYXRlcmlhbHMuaHRtbCcpLFxuICAgICAgICBwcm9kdWN0aW9uOiByZXNvbHZlKF9fZGlybmFtZSwgJ3BhZ2VzL3Byb2R1Y3Rpb24uaHRtbCcpLFxuICAgICAgICBzZXR0aW5nczogcmVzb2x2ZShfX2Rpcm5hbWUsICdwYWdlcy9zZXR0aW5ncy5odG1sJylcbiAgICAgIH1cbiAgICB9XG4gIH1cbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWtVLFNBQVMsb0JBQW9CO0FBQy9WLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjLFdBQVcsa0JBQWtCO0FBSHBELElBQU0sbUNBQW1DO0FBTXpDLElBQU0saUJBQWlCLE1BQU07QUFDM0IsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04saUJBQWlCO0FBQ2YsWUFBTSxnQkFBZ0IsUUFBUSxrQ0FBVyxpQkFBaUI7QUFDMUQsVUFBSSxDQUFDLFdBQVcsYUFBYSxHQUFHO0FBQzlCLGtCQUFVLGVBQWUsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUFBLE1BQzlDO0FBR0EsWUFBTSxpQkFBaUIsQ0FBQyx1QkFBdUIsY0FBYztBQUM3RCxxQkFBZSxRQUFRLFVBQVE7QUFDN0IsY0FBTSxhQUFhLFFBQVEsa0NBQVcsY0FBYyxJQUFJLEVBQUU7QUFDMUQsWUFBSSxXQUFXLFVBQVUsR0FBRztBQUMxQix1QkFBYSxZQUFZLFFBQVEsa0NBQVcsbUJBQW1CLElBQUksRUFBRSxDQUFDO0FBQUEsUUFDeEU7QUFBQSxNQUNGLENBQUM7QUFHRCxZQUFNLFVBQVU7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFFQSxjQUFRLFFBQVEsVUFBUTtBQUN0QixjQUFNLGFBQWEsUUFBUSxrQ0FBVyxJQUFJO0FBQzFDLGNBQU0sV0FBVyxRQUFRLGtDQUFXLFFBQVEsSUFBSSxFQUFFO0FBRWxELFlBQUksV0FBVyxVQUFVLEdBQUc7QUFFMUIsZ0JBQU0sVUFBVSxTQUFTLFVBQVUsR0FBRyxTQUFTLFlBQVksR0FBRyxDQUFDO0FBQy9ELGNBQUksQ0FBQyxXQUFXLE9BQU8sR0FBRztBQUN4QixzQkFBVSxTQUFTLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFBQSxVQUN4QztBQUVBLHVCQUFhLFlBQVksUUFBUTtBQUFBLFFBQ25DO0FBQUEsTUFDRixDQUFDO0FBR0QsWUFBTSxlQUFlLFFBQVEsa0NBQVcsc0JBQXNCO0FBQzlELFVBQUksV0FBVyxZQUFZLEdBQUc7QUFDNUIscUJBQWEsY0FBYyxRQUFRLGtDQUFXLG9CQUFvQixDQUFDO0FBQUEsTUFDckU7QUFHQSxZQUFNLGVBQWUsUUFBUSxrQ0FBVyxLQUFLO0FBQzdDLFlBQU0sYUFBYSxRQUFRLGtDQUFXLFVBQVU7QUFDaEQsVUFBSSxXQUFXLFlBQVksR0FBRztBQUM1QixZQUFJLENBQUMsV0FBVyxVQUFVLEdBQUc7QUFDM0Isb0JBQVUsWUFBWSxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUEsUUFDM0M7QUFDQSxjQUFNLFdBQVcsQ0FBQyxtQkFBbUIsVUFBVTtBQUMvQyxpQkFBUyxRQUFRLFVBQVE7QUFDdkIsZ0JBQU0sYUFBYSxRQUFRLGNBQWMsSUFBSTtBQUM3QyxjQUFJLFdBQVcsVUFBVSxHQUFHO0FBQzFCLHlCQUFhLFlBQVksUUFBUSxZQUFZLElBQUksQ0FBQztBQUFBLFVBQ3BEO0FBQUEsUUFDRixDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0Y7QUFHQSxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxHQUFHLGVBQWUsQ0FBQztBQUFBLEVBQ25DLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQTtBQUFBLElBQ04sS0FBSztBQUFBLE1BQ0gsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBO0FBQUEsSUFDWDtBQUFBLElBQ0EsT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsUUFBUTtBQUFBLE1BQ1Y7QUFBQSxJQUNGO0FBQUE7QUFBQSxJQUVBLGdCQUFnQjtBQUFBLElBQ2hCLGdCQUFnQixRQUFRO0FBQ3RCLGFBQU8sWUFBWSxJQUFJLENBQUMsS0FBSyxLQUFLLFNBQVM7QUFFekMsWUFBSSxJQUFJLE9BQU8sSUFBSSxJQUFJLFNBQVMsT0FBTyxLQUFLLENBQUMsSUFBSSxJQUFJLFNBQVMsSUFBSSxLQUFLLENBQUMsSUFBSSxJQUFJLFNBQVMsTUFBTSxHQUFHO0FBQ2hHLGNBQUksV0FBVyxJQUFJO0FBR25CLGNBQUksQ0FBQyxJQUFJLElBQUksV0FBVyxTQUFTLEdBQUc7QUFDbEMsa0JBQU0sVUFBVTtBQUFBLGNBQ2QsZUFBZTtBQUFBLGNBQ2YseUJBQXlCO0FBQUEsY0FDekIseUJBQXlCO0FBQUEsY0FDekIsbUJBQW1CO0FBQUEsY0FDbkIsb0JBQW9CO0FBQUEsY0FDcEIsa0JBQWtCO0FBQUEsWUFDcEI7QUFFQSx1QkFBVyxRQUFRLElBQUksR0FBRyxLQUFLLElBQUk7QUFBQSxVQUNyQztBQUVBLGtCQUFRLElBQUksd0JBQXdCLElBQUksR0FBRyxXQUFNLFFBQVEsRUFBRTtBQUMzRCxjQUFJLE1BQU07QUFBQSxRQUNaO0FBQ0EsYUFBSztBQUFBLE1BQ1AsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixPQUFPO0FBQUEsUUFDTCxNQUFNLFFBQVEsa0NBQVcsWUFBWTtBQUFBLFFBQ3JDLE9BQU8sUUFBUSxrQ0FBVyxrQkFBa0I7QUFBQSxRQUM1QyxPQUFPLFFBQVEsa0NBQVcsNEJBQTRCO0FBQUEsUUFDdEQsZ0JBQWdCLFFBQVEsa0NBQVcsNEJBQTRCO0FBQUEsUUFDL0QsV0FBVyxRQUFRLGtDQUFXLHNCQUFzQjtBQUFBLFFBQ3BELFlBQVksUUFBUSxrQ0FBVyx1QkFBdUI7QUFBQSxRQUN0RCxVQUFVLFFBQVEsa0NBQVcscUJBQXFCO0FBQUEsTUFDcEQ7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
