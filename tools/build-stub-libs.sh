#!/usr/bin/env bash
# Сборка пустых заглушек libnss3/libnspr4/libnssutil3 для headless-chromium
# (@sparticuz/chromium линкуется с NSS/NSPR) в песочницах без системных пакетов.
# Нужны именно ОПРЕДЕЛЁННЫЕ заглушки: пустая библиотека не проходит — под
# BIND_NOW chromium падает на PK11_FreeSlot (неразрешённый символ), поэтому
# в nssstub.c определены все импорты, которые тянет загрузчик (NSS_*/PK11_*/
# SEC*/CERT_* + PR_*), а version-script задаёт нужные версии символов
# (NSS_3.x, NSSUTIL_3.12.3). Вызовы возвращают «пусто» — браузеру хватает,
# сертификаты ему в offline-проверке не нужны.
#
# Использование:
#   tools/build-stub-libs.sh [OUT_DIR]   # по умолчанию tools/.browser-stub
#   CHROMIUM_EXTRA_LIBS=$PWD/tools/.browser-stub node tools/browser-check.js
#
# Каталог по умолчанию в .gitignore (в репозитории только этот скрипт).
set -e
OUT="${1:-$(dirname "$0")/.browser-stub}"
mkdir -p "$OUT"
cd "$OUT"

cat > nssstub.c <<'C'
/* Minimal no-op NSS/NSPR stubs — only to satisfy the dynamic loader in a
   sandbox without libnss3. Not part of the app; used for local browser checks. */
#include <stdint.h>
#include <string.h>
#include <time.h>

static char ver[] = "3.30";
static char empty[] = "";

void *NSS_VersionCheck(const char *v) { (void)v; return ver; }
void *NSS_NoDB_Init(const char *p) { (void)p; return (void *)0; }
void *NSS_InitReadWrite(const char *p) { (void)p; return (void *)0; }
long NSS_SetAlgorithmPolicy(long a, long b, long c) { (void)a;(void)b;(void)c; return 0; }
void *PK11_GetInternalKeySlot(void) { return (void *)0; }
void PK11_FreeSlot(void *s) { (void)s; }
void *PK11_GetModule(void *s) { (void)s; return (void *)0; }
long PK11_IsPresent(void *s) { (void)s; return 0; }
long PK11_NeedUserInit(void *s) { (void)s; return 0; }
long PK11_InitPin(void *s, const char *a, const char *b) { (void)s;(void)a;(void)b; return 0; }
long PK11_HasAttributeSet(void *s, long a, long b) { (void)s;(void)a;(void)b; return 0; }
long PK11_HasRootCerts(void *s) { (void)s; return 0; }
void *PK11_FindCertInSlot(void *s, void *c, void *u) { (void)s;(void)c;(void)u; return (void *)0; }
void *PK11_ListCertsInSlot(void *s, void *t, void *u) { (void)s;(void)t;(void)u; return (void *)0; }
void *PK11_ListCerts(long t, void *u) { (void)t;(void)u; return (void *)0; }
void *PK11_FindGenericObjects(void *s, long t) { (void)s;(void)t; return (void *)0; }
void *PK11_GetNextGenericObject(void *l) { (void)l; return (void *)0; }
void PK11_DestroyGenericObjects(void *l) { (void)l; }
long PK11_ReadRawAttribute(long t, void *o, void *i) { (void)t;(void)o;(void)i; return -1; }
void *PK11_GetTokenName(void *s) { (void)s; return (void *)0; }
void PK11_ReferenceSlot(void *s) { (void)s; }
void PK11_SetPasswordFunc(void *f) { (void)f; }
void *SECITEM_AllocItem(void *a, void *b, unsigned long c) { (void)a;(void)b;(void)c; return (void *)0; }
void SECITEM_FreeItem(void *i, int f) { (void)i;(void)f; }
void SECMOD_DestroyModule(void *m) { (void)m; }
void *SECMOD_GetDefaultModuleList(void) { return (void *)0; }
void *SECMOD_GetDefaultModuleListLock(void) { return (void *)0; }
void *SECMOD_GetReadLock(void *l) { (void)l; return (void *)0; }
void *SECMOD_LoadUserModule(const char *a, const char *b, void *c) { (void)a;(void)b;(void)c; return (void *)0; }
void SECMOD_ReleaseReadLock(void *l) { (void)l; }
void *CERT_CreateSubjectCertList(void *a, void *b, unsigned long c, int d) { (void)a;(void)b;(void)c;(void)d; return (void *)0; }
void CERT_DestroyCertList(void *l) { (void)l; }
void CERT_DestroyCertificate(void *c) { (void)c; }
void *CERT_DupCertificate(void *c) { (void)c; return (void *)0; }
void *CERT_FindCertByDERCert(void *h, void *d) { (void)h;(void)d; return (void *)0; }
long CERT_GetCertTrust(void *c, void *t) { (void)c;(void)t; return -1; }
void *CERT_GetDefaultCertDB(void) { return (void *)0; }
long CERT_IsUserCert(void *c) { (void)c; return 0; }
long PR_GetError(void) { return 0; }
char *PR_GetErrorText(char *buf, unsigned long len) { if (buf && len) buf[0] = 0; return buf; }
unsigned long PR_GetErrorTextLength(void) { return 0; }
long PR_GetOSError(void) { return 0; }
long PR_Init(int t, long p, long m) { (void)t;(void)p;(void)m; return 0; }
void PR_Now(int64_t *now) { struct timespec ts; clock_gettime(CLOCK_REALTIME, &ts); if (now) *now = (int64_t)ts.tv_sec * 1000000 + ts.tv_nsec / 1000; }
C

cat > nss.map <<'MAP'
NSS_3.2 { global: *; };
NSS_3.3 { global: *; };
NSS_3.4 { global: *; };
NSS_3.6 { global: *; };
NSS_3.9.2 { global: *; };
NSS_3.30 { global: *; };
MAP
cat > nssutil.map <<'MAP'
NSSUTIL_3.12.3 { global: *; };
MAP

gcc -shared -fPIC -o libnss3.so     nssstub.c -Wl,--version-script=nss.map
gcc -shared -fPIC -o libnspr4.so    nssstub.c
gcc -shared -fPIC -o libnssutil3.so nssstub.c -Wl,--version-script=nssutil.map
rm -f nssstub.c nss.map nssutil.map
echo "stub libs собраны в $PWD"
