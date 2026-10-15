package main

// The served, embedded application can only load app-origin resources and
// local media blobs; remote scripts, fonts, images, iframes and fetch calls
// are forbidden by the browser. Inline scripts and eval are required by the
// existing standalone React build. These permissions do not allow outbound
// fetches because connect-src is restricted to self (127.0.0.1:58319).
const offlineContentSecurityPolicy = "default-src 'none'; " +
	"connect-src 'self'; " +
	"script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob:; " +
	"media-src 'self' data: blob:; " +
	"font-src 'self' data:; " +
	"worker-src 'self' blob:; " +
	"form-action 'self'; " +
	"base-uri 'none'; " +
	"frame-src 'none'; " +
	"object-src 'none'; " +
	"frame-ancestors 'none'"
