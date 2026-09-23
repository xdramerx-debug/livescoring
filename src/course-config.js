// ESM canonical source for course configuration.
// Mirrors js/course-config.js. Once the HTML switches to <script type="module">,
// this file (bundled via Vite) replaces the classic script. As a migration
// aid it also exposes the same symbols on `window`, so the legacy classic
// scripts (utils.js, admin.js, …) keep working until they are migrated.
export const CLUB = 'Гольф-клуб Пестово';
export const TOTAL_PAR = 72;
export const ADDR = 'МО, г. Мытищи, Никольская ул., 1, Румянцево';

export const HOLES = {
    1:{p:4,hcp:5,bk:373,bl:339,wh:328,rd:317},
    2:{p:4,hcp:13,bk:272,bl:257,wh:257,rd:250},
    3:{p:5,hcp:9,bk:486,bl:475,wh:464,rd:423},
    4:{p:3,hcp:11,bk:192,bl:174,wh:161,rd:144},
    5:{p:4,hcp:1,bk:411,bl:382,wh:370,rd:331},
    6:{p:4,hcp:15,bk:377,bl:345,wh:333,rd:316},
    7:{p:4,hcp:3,bk:406,bl:380,wh:336,rd:308},
    8:{p:3,hcp:7,bk:181,bl:165,wh:159,rd:132},
    9:{p:5,hcp:17,bk:507,bl:459,wh:421,rd:399},
    10:{p:5,hcp:12,bk:491,bl:470,wh:461,rd:442},
    11:{p:4,hcp:16,bk:382,bl:362,wh:345,rd:318},
    12:{p:4,hcp:2,bk:383,bl:375,wh:365,rd:322},
    13:{p:3,hcp:18,bk:185,bl:162,wh:138,rd:123},
    14:{p:4,hcp:4,bk:374,bl:362,wh:327,rd:323},
    15:{p:5,hcp:8,bk:533,bl:517,wh:483,rd:454},
    16:{p:4,hcp:14,bk:423,bl:391,wh:368,rd:312},
    17:{p:3,hcp:10,bk:199,bl:188,wh:174,rd:151},
    18:{p:4,hcp:6,bk:375,bl:349,wh:335,rd:302}
};

export const TIMINGS = {1:15,2:15,3:20,4:12,5:15,6:15,7:15,8:12,9:20,10:20,11:15,12:15,13:12,14:15,15:20,16:15,17:12,18:15};
export const TEES = {bk:'Чёрный',bl:'Синий',wh:'Белый',rd:'Красный'};
export const TEE_ORDER = ['bk', 'bl', 'wh', 'rd'];
export const COURSE_RATINGS = {
    men:{bk:{cr:76.0,sr:144},bl:{cr:73.8,sr:137},wh:{cr:72.0,sr:135},rd:{cr:69.2,sr:134}},
    women:{bl:{cr:80.8,sr:153},wh:{cr:78.6,sr:143},rd:{cr:75.2,sr:136}}
};

export function holePar(h){return HOLES[h]?HOLES[h].p:4;}
export function holeDist(h,teeCode){teeCode=teeCode||'wh';return HOLES[h]?(HOLES[h][teeCode]||0):0;}
export function holeHcp(h){return HOLES[h]?HOLES[h].hcp:h;}
export function holeTiming(h){return TIMINGS[h]||15;}

if (typeof window !== 'undefined') {
    Object.assign(window, { CLUB, TOTAL_PAR, ADDR, HOLES, TIMINGS, TEES, TEE_ORDER, COURSE_RATINGS, holePar, holeDist, holeHcp, holeTiming });
}
