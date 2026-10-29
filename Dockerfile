FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js config.js style.css sw.js manifest.webmanifest /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
COPY vendor /usr/share/nginx/html/vendor
EXPOSE 80
 