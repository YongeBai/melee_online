extern unsigned portMenuProduct(void);
static int port_stage_legal(int stage){return stage==31||stage==32||stage==28||stage==8||stage==2||stage==3;}
void portStageMenuProductLayout(void)
{
    if(!portMenuProduct())return;
    for(unsigned i=0;i<30;i++){
        if(port_stage_legal(mnStageSel_803F06D0[i].stkind)&&i<29)mnStageSel_803F06D0[i].x8=2;
        else {mnStageSel_803F06D0[i].x8=0;if(mnStageSel_803F06D0[i].x0)HSD_JObjSetFlagsAll(mnStageSel_803F06D0[i].x0,JOBJ_HIDDEN);}
    }
    if(mnStageSel_804D6CAE<30&&!mnStageSel_803F06D0[mnStageSel_804D6CAE].x8)mnStageSel_804D6CAE=30;
}
