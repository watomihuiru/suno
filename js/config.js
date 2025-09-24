export const modelMap = { 
    "V5": "V5",
    "V4_5PLUS": "V4.5+", 
    "V4_5": "V4.5", 
    "V4": "V4", 
    "V3_5": "V3.5" 
};

export const modelLimits = {
    'V5': { prompt: 5000, style: 1000 },
    'V3_5': { prompt: 3000, style: 200 },
    'V4': { prompt: 3000, style: 200 },
    'V4_5': { prompt: 5000, style: 1000 },
    'V4_5PLUS': { prompt: 5000, style: 1000 },
    'title': 80,
    'songDescription': 400
};

export const extendModelLimits = {
    'V5': { prompt: 5000, style: 1000, title: 100 },
    'V3_5': { prompt: 3000, style: 200, title: 80 },
    'V4': { prompt: 3000, style: 200, title: 80 },
    'V4_5': { prompt: 5000, style: 1000, title: 100 },
    'V4_5PLUS': { prompt: 5000, style: 1000, title: 100 }
};