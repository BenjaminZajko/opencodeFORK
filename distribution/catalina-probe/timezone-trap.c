#include <stdint.h>
#include <unistd.h>
extern int32_t ucal_getHostTimeZone(uint16_t*,int32_t,int32_t*);
static int32_t missing(uint16_t*a,int32_t b,int32_t*c){const char msg[]="TRAP: unavailable Catalina host timezone API reached\n";write(2,msg,sizeof(msg)-1);_exit(88);}
__attribute__((used)) static struct {const void* replacement;const void* original;} interposers[] __attribute__((section("__DATA,__interpose")))={{(const void*)missing,(const void*)ucal_getHostTimeZone}};
