// Score-formatting helpers (moved from utils.js)
// Uses global t() (i18n) only at call time, so it is safe to load before utils.js.
function fmtScore(s){if(s===null||s===undefined||isNaN(s))return'—';if(s===0)return'E';return s>0?'+'+s:''+s;}
function scoreClass(s){if(s===null||s===undefined)return'';return s<0?'s-un':s>0?'s-ov':'s-ev';}
function holeResClass(s,p){if(!s||s<1||!p)return'';var d=s-p;if(d<=-2)return'r-eag';if(d===-1)return'r-bir';if(d===0)return'r-par';if(d===1)return'r-bog';return'r-dbl';}
function holeResName(s,p){
    if(!s||!p)return'';
    if(s===1)return t('res_hio');
    var d=s-p;
    if(d<=-3)return t('res_albatross');
    if(d===-2)return t('res_eagle');
    if(d===-1)return t('res_birdie');
    if(d===0)return t('res_par');
    if(d===1)return t('res_bogey');
    if(d===2)return t('res_double');
    return '+'+d;
}
