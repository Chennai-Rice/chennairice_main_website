// Build step: the email templates are read from disk at run time, so they are
// copied next to the bundle (lib/templates), where email-template.js looks.
const fs = require('node:fs')
const path = require('node:path')

fs.cpSync(path.join(__dirname, '..', 'backend', 'templates'), path.join(__dirname, 'lib', 'templates'), { recursive: true })
