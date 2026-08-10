FROM nginx:alpine

RUN printf 'server {\n  listen 80;\n  location / {\n    return 200 "frontend scaffold\n";\n  }\n}\n' > /etc/nginx/conf.d/default.conf
