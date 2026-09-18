/* Synchronous browser implementation of the GX EFB-to-texture boundary used
 * by the original result portraits. The JavaScript receiver performs the
 * framebuffer readback and writes console-tiled texture bytes to dest. */
#include <dolphin/gx.h>
#include <emscripten.h>
#include <stdlib.h>

static u16 source_x,source_y,source_width,source_height,dest_width,dest_height;
static GXTexFmt dest_format;
static GXBool dest_mipmap;
static unsigned copy_count;

EM_JS(void,emit_efb_copy,(void* dest,u16 x,u16 y,u16 width,u16 height,GXTexFmt format,GXBool clear),{
    if(typeof Module.onNativeEfbCopy!=='function')throw Error('Native EFB copy receiver absent');
    Module.onNativeEfbCopy(dest,x,y,width,height,format,clear);
});

void GXSetTexCopySrc(u16 left,u16 top,u16 width,u16 height)
{
    if(!width||!height||left+width>640||top+height>480)abort();
    source_x=left;source_y=top;source_width=width;source_height=height;
}
void GXSetTexCopyDst(u16 width,u16 height,GXTexFmt format,GXBool mipmap)
{
    if(!width||!height||width!=source_width||height!=source_height||format!=GX_TF_RGB5A3||mipmap)abort();
    dest_width=width;dest_height=height;dest_format=format;dest_mipmap=mipmap;
}
void GXCopyTex(void* dest,GXBool clear)
{
    if(!dest||dest_width!=source_width||dest_height!=source_height||dest_format!=GX_TF_RGB5A3||dest_mipmap)abort();
    emit_efb_copy(dest,source_x,source_y,dest_width,dest_height,dest_format,clear);copy_count++;
}
void GXInvalidateTexAll(void){}
unsigned portEfbCopyCount(void){return copy_count;}
