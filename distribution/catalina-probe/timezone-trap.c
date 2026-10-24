#include <stdint.h>
#include <unistd.h>
extern void uplrules_selectForRange(void);
extern void ulistfmt_openForType(void);
extern void udtitvfmt_formatCalendarToResult(void);
extern void ucal_getTimeZoneOffsetFromLocal(void);
extern void ubrk_clone(void);
extern void unumrf_openForSkeletonWithCollapseAndIdentityFallback(void);
extern void unumrf_openResult(void);
extern void unumrf_formatDoubleRange(void);
extern void unumrf_formatDecimalRange(void);
extern void unumrf_resultAsValue(void);
extern void unumrf_close(void);
extern void unumrf_closeResult(void);
extern int32_t ucal_getHostTimeZone(uint16_t*,int32_t,int32_t*);
static int32_t missing(uint16_t*a,int32_t b,int32_t*c){const char msg[]="TRAP: unavailable Catalina ICU API reached\n";write(2,msg,sizeof(msg)-1);_exit(88);}
__attribute__((used)) static struct {const void* replacement;const void* original;} interposers[] __attribute__((section("__DATA,__interpose")))={{(const void*)missing,(const void*)uplrules_selectForRange},{(const void*)missing,(const void*)ulistfmt_openForType},{(const void*)missing,(const void*)udtitvfmt_formatCalendarToResult},{(const void*)missing,(const void*)ucal_getTimeZoneOffsetFromLocal},{(const void*)missing,(const void*)ubrk_clone},{(const void*)missing,(const void*)ucal_getHostTimeZone},
{(const void*)missing,(const void*)unumrf_openForSkeletonWithCollapseAndIdentityFallback},
{(const void*)missing,(const void*)unumrf_openResult},
{(const void*)missing,(const void*)unumrf_formatDoubleRange},
{(const void*)missing,(const void*)unumrf_formatDecimalRange},
{(const void*)missing,(const void*)unumrf_resultAsValue},
{(const void*)missing,(const void*)unumrf_close},
{(const void*)missing,(const void*)unumrf_closeResult}};
