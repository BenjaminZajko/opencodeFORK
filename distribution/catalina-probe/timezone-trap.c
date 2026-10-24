#include <unistd.h>

extern void ubrk_clone(void);
static void missing_ubrk_clone(void) {
    const char message[] = "TRAP: ubrk_clone unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void ucal_getHostTimeZone(void);
static void missing_ucal_getHostTimeZone(void) {
    const char message[] = "TRAP: ucal_getHostTimeZone unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void ucal_getTimeZoneOffsetFromLocal(void);
static void missing_ucal_getTimeZoneOffsetFromLocal(void) {
    const char message[] = "TRAP: ucal_getTimeZoneOffsetFromLocal unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void udtitvfmt_formatCalendarToResult(void);
static void missing_udtitvfmt_formatCalendarToResult(void) {
    const char message[] = "TRAP: udtitvfmt_formatCalendarToResult unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void ulistfmt_openForType(void);
static void missing_ulistfmt_openForType(void) {
    const char message[] = "TRAP: ulistfmt_openForType unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void unumrf_close(void);
static void missing_unumrf_close(void) {
    const char message[] = "TRAP: unumrf_close unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void unumrf_closeResult(void);
static void missing_unumrf_closeResult(void) {
    const char message[] = "TRAP: unumrf_closeResult unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void unumrf_formatDecimalRange(void);
static void missing_unumrf_formatDecimalRange(void) {
    const char message[] = "TRAP: unumrf_formatDecimalRange unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void unumrf_formatDoubleRange(void);
static void missing_unumrf_formatDoubleRange(void) {
    const char message[] = "TRAP: unumrf_formatDoubleRange unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void unumrf_openForSkeletonWithCollapseAndIdentityFallback(void);
static void missing_unumrf_openForSkeletonWithCollapseAndIdentityFallback(void) {
    const char message[] = "TRAP: unumrf_openForSkeletonWithCollapseAndIdentityFallback unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void unumrf_openResult(void);
static void missing_unumrf_openResult(void) {
    const char message[] = "TRAP: unumrf_openResult unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void unumrf_resultAsValue(void);
static void missing_unumrf_resultAsValue(void) {
    const char message[] = "TRAP: unumrf_resultAsValue unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

extern void uplrules_selectForRange(void);
static void missing_uplrules_selectForRange(void) {
    const char message[] = "TRAP: uplrules_selectForRange unavailable on Catalina\n";
    write(2, message, sizeof(message) - 1);
    _exit(88);
}

__attribute__((used)) static struct { const void* replacement; const void* original; }
interposers[] __attribute__((section("__DATA,__interpose"))) = {
    {(const void*)missing_ubrk_clone, (const void*)ubrk_clone},
    {(const void*)missing_ucal_getHostTimeZone, (const void*)ucal_getHostTimeZone},
    {(const void*)missing_ucal_getTimeZoneOffsetFromLocal, (const void*)ucal_getTimeZoneOffsetFromLocal},
    {(const void*)missing_udtitvfmt_formatCalendarToResult, (const void*)udtitvfmt_formatCalendarToResult},
    {(const void*)missing_ulistfmt_openForType, (const void*)ulistfmt_openForType},
    {(const void*)missing_unumrf_close, (const void*)unumrf_close},
    {(const void*)missing_unumrf_closeResult, (const void*)unumrf_closeResult},
    {(const void*)missing_unumrf_formatDecimalRange, (const void*)unumrf_formatDecimalRange},
    {(const void*)missing_unumrf_formatDoubleRange, (const void*)unumrf_formatDoubleRange},
    {(const void*)missing_unumrf_openForSkeletonWithCollapseAndIdentityFallback, (const void*)unumrf_openForSkeletonWithCollapseAndIdentityFallback},
    {(const void*)missing_unumrf_openResult, (const void*)unumrf_openResult},
    {(const void*)missing_unumrf_resultAsValue, (const void*)unumrf_resultAsValue},
    {(const void*)missing_uplrules_selectForRange, (const void*)uplrules_selectForRange},
};
