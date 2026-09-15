/* Browser-native reporting and fatal-error boundary. */
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>

void OSReport(char* format, ...)
{
    va_list args;
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
}

__attribute__((noreturn)) void __assert(const char* file, unsigned line, const char* condition)
{
    fprintf(stderr, "%s:%u: %s\n", file, line, condition);
    abort();
}

__attribute__((noreturn)) void HSD_Panic(const char* file,unsigned line,const char* message)
{
    __assert(file,line,message);
}
__attribute__((noreturn)) void OSPanic(const char* file,int line,const char* format,...)
{
    fprintf(stderr,"%s:%d: ",file,line);
    va_list args;va_start(args,format);vfprintf(stderr,format,args);va_end(args);
    abort();
}
