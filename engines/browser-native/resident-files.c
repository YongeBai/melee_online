/* Browser file boundary: JS prefetches and type-converts an asset before C can
 * request it. Original lbArchive loading/parsing/varargs/relocation is retained.
 * There are no disc waits or asynchronous callbacks in this synchronous path.
 * Allocated archives use the HSD heap (0). Preload hits instead borrow pinned,
 * immutable bytes; no GameCube ARAM address or disc callback is emulated.
 */
#include <melee/lb/lbfile.h>
#include <melee/lb/lbheap.h>
#include <melee/lb/lbarchive.h>
#include <sysdolphin/baselib/memory.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define FILE_CAPACITY 128
struct ResidentFile { char name[32]; unsigned char* bytes; size_t size; unsigned pins; };
static struct ResidentFile files[FILE_CAPACITY];
static unsigned file_count, read_count, allocation_count;
static size_t byte_count;
extern int portRuntimeInit(void);

static int valid_name(const char* name)
{
    if(!name)return 0;
    size_t n=strnlen(name,32);if(n<5||n>=32)return 0;
    /* Only explicit archive filenames: locale selection belongs to the caller
     * until the original language/settings subsystem has been integrated. */
    if(strcmp(name+n-4,".dat")&&strcmp(name+n-4,".usd"))return 0;
    for(size_t i=0;i<n-4;i++)if(!((name[i]>='A'&&name[i]<='Z')||
        (name[i]>='a'&&name[i]<='z')||(name[i]>='0'&&name[i]<='9')||name[i]=='_'))return 0;
    return 1;
}
static struct ResidentFile* find_file(const char* name)
{
    /* Original pause and card loaders request locale basenames. This target uses
     * the prefetched USA artwork; arbitrary extension guessing stays forbidden. */
    if(name&&!strcmp(name,"GmPause"))name="GmPause.usd";
    if(name&&!strcmp(name,"LbMcGame."))name="LbMcGame.usd";
    if(name&&!strcmp(name,"NtMemAc"))name="NtMemAc.usd";
    if(!valid_name(name))return NULL;
    for(unsigned i=0;i<file_count;i++)if(!strcmp(files[i].name,name))return &files[i];
    return NULL;
}
int portFileInstall(const char* name,const unsigned char* bytes,size_t size)
{
    if(!valid_name(name)||!bytes||!size||size>64*1024*1024)return -1;
    if(find_file(name))return -2;
    if(file_count==FILE_CAPACITY)return -3;
    unsigned char* copy=malloc(size);if(!copy)return -4;
    memcpy(copy,bytes,size);struct ResidentFile* file=&files[file_count++];
    strcpy(file->name,name);file->bytes=copy;file->size=size;byte_count+=size;
    return 0;
}
unsigned portFileCount(void){return file_count;}
size_t portFileBytes(void){return byte_count;}
unsigned portFileReads(void){return read_count;}
unsigned portFileAllocations(void){return allocation_count;}
int portFileClear(void)
{
    for(unsigned i=0;i<file_count;i++)if(files[i].pins)return -1;
    for(unsigned i=0;i<file_count;i++)free(files[i].bytes);
    memset(files,0,sizeof(files));file_count=0;byte_count=0;read_count=0;return 0;
}
size_t lbFileGetSize(const char* name)
{
    struct ResidentFile* file=find_file(name);
    if(!file){fprintf(stderr,"Native asset was not prefetched: %s\n",name?name:"(null)");abort();}
    return file->size;
}
void lbFile_8001668C(const char* name,void* dst,size_t* size)
{
    struct ResidentFile* file=find_file(name);
    if(!file||!dst||!size){fprintf(stderr,"Invalid native resident file read\n");abort();}
    memcpy(dst,file->bytes,file->size);*size=file->size;read_count++;
}
void* lbHeap_80015BD0(int heap_id,size_t size)
{
    if(heap_id!=0||!size||portRuntimeInit()<0)abort();
    void* result=HSD_MemAlloc(size);if(!result)abort();allocation_count++;return result;
}
void lbHeap_80015CA8(int heap_id,void* pointer)
{
    if(heap_id!=0||!pointer||!allocation_count)abort();
    HSD_Free(pointer);allocation_count--;
}
HSD_Archive* portFileArchive(const char* name,const char* symbol,void** address)
{
    return lbArchive_LoadSymbols(name,address,symbol,(void**)NULL);
}
void portFileArchiveClose(HSD_Archive* archive){lbArchive_80016EFC(archive);}
/* Exercise the original C varargs iteration with more than one symbol. */
HSD_Archive* portFileArchivePair(const char* name,const char* first,const char* second,void** addresses)
{
    return lbArchive_LoadSymbols(name,&addresses[0],first,&addresses[1],second,(void**)NULL);
}

/* Original preload-cache hit semantics. The owner releases the pin when its
 * motion table no longer references this resident animation bundle. */
bool lbFile_800168A0(int heap_id,const char* name,void** dst,size_t* size)
{
    struct ResidentFile* file=find_file(name);
    if(!file||!dst||!size||heap_id<0||heap_id>5)abort();
    file->pins++;*dst=file->bytes;*size=file->size;return true;
}
void portFileRelease(const char* name)
{
    struct ResidentFile* file=find_file(name);if(!file||!file->pins)abort();file->pins--;
}
unsigned portFilePins(void)
{
    unsigned n=0;for(unsigned i=0;i<file_count;i++)n+=files[i].pins;return n;
}
void portResidentCopy(void* dst,uintptr_t source,size_t size)
{
    for(unsigned i=0;i<file_count;i++) {
        uintptr_t begin=(uintptr_t)files[i].bytes;
        if(source>=begin&&source-begin<=files[i].size&&size<=files[i].size-(source-begin)) {
            memcpy(dst,(void*)source,size);return;
        }
    }
    fprintf(stderr,"Animation address is outside resident native assets\n");abort();
}

/* The browser prefetch cache holds immutable native bytes, not already parsed
 * DVD archives. Return a cache miss so original lbArchive_80017040 parses and
 * owns its copy; CostumeListsForeachCharacter provides the game-level cache. */
HSD_Archive* lbDvd_8001819C(const char* filename)
{
    if(!valid_name(filename))abort();return NULL;
}
