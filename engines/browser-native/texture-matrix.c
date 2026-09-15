/* Appended to the unchanged MakeTextureMtx definition selected from pinned
 * HSD tobj.c. Keep texture transform arithmetic in the original native code.
 */
int portTextureMatrix(const float* srt,unsigned repeat_s,unsigned repeat_t,
                      unsigned wrap_t,float* output)
{
    if(!repeat_s||repeat_s>255||!repeat_t||repeat_t>255||wrap_t>2)return -1;
    for(int i=0;i<9;i++)if(!isfinite(srt[i]))return -2;
    HSD_TObj texture={0};
    texture.rotate=(Quaternion){srt[0],srt[1],srt[2],0};
    texture.scale=(Vec3){srt[3],srt[4],srt[5]};
    texture.translate=(Vec3){srt[6],srt[7],srt[8]};
    texture.repeat_s=repeat_s;texture.repeat_t=repeat_t;texture.wrap_t=wrap_t;
    MakeTextureMtx(&texture);
    for(int r=0;r<3;r++)for(int c=0;c<4;c++)output[r*4+c]=texture.mtx[r][c];
    return 0;
}
