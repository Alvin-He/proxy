# Corsidium

A service worker based proxy, with good speeds and site supports  

The project is still in Beta, you can download the source code and try it out your self using node.js  
*Branch Master is depercated, use Test. Master relies on logics that's completetly different and wrost than Test's.*  

```bash
git clone https://github.com/Alvin-He/proxy.git
cd proxy
node corsidium.js
# npm install is not necessary as there're no external dependencies that's not included with node
# you can still run the code with npm start
```

**REPLIT, GLITCH, HEROKU & other PasS deploys**   
Make sure you have the envionment variable `HTTPS_PASSTHROUGH` set to `true` Other wise deployment issues can occour.   
This is not required from direct node.js deploys on local machines.

## Links:
Replit Repo: https://replit.com/@whenxequalsy/proxy  
Heroku depoly(Branch Test): https://corsidium.herokuapp.com/ *Due to heroku side o-auth security issues, Depolyment is temporarily Paused  
