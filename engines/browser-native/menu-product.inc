/* Typed equivalent of the tested two-seat CSS layout. Included into the pinned
 * menu translation unit so original private HSD objects remain the owners. */
extern unsigned portMenuProduct(void);
static HSD_JObj* port_css_shift[11];
static float port_css_x[11],port_tag_x[2];
static const unsigned port_shift_ids[11]={0x2a,0x2f,0x34,0x39,0x43,0x5d,0x75,0x78,0x79,0x8d,0xa7};
void portCharacterMenuProductLayout(void)
{
    if(!portMenuProduct())return;
    for(unsigned i=0;i<11;i++){HSD_JObjSetTranslateX(port_css_shift[i],port_css_x[i]+30.8f);HSD_JObjSetFlagsAll(port_css_shift[i],JOBJ_MTX_DIRTY);}
    const unsigned hidden[]={0x2b,0x2c,0x30,0x31,0x35,0x36,0x3a,0x3b,0x49,0x4f,0x63,0x69,0x7a,0x7d,0x7e,0x7f,0x82,0x83,0x94,0x9c,0xa9,0xab};
    for(unsigned i=0;i<sizeof(hidden)/sizeof(hidden[0]);i++){HSD_JObj* j;lb_80011E24(mnCharSel_804D6CC0,&j,hidden[i],-1);HSD_JObjSetFlagsAll(j,JOBJ_HIDDEN);}
    for(unsigned i=1;i<4;i++){CSSTagData* d=mnCharSel_803F0E8C[i].data;if(!d)continue;
        if(i==1){d->text->pos_x=port_tag_x[0]+30.8f;d->name_ls->pos_x=port_tag_x[1]+30.8f;}
        else {d->text->hidden=1;d->name_ls->hidden=1;}
    }
}
void portCharacterMenuProductInitialize(void)
{
    if(!portMenuProduct())return;
    for(unsigned i=0;i<11;i++){lb_80011E24(mnCharSel_804D6CC0,&port_css_shift[i],port_shift_ids[i],-1);port_css_x[i]=port_css_shift[i]->translate.x;}
    CSSTagData* d=mnCharSel_803F0E8C[1].data;HSD_ASSERT(0,d&&d->text&&d->name_ls);port_tag_x[0]=d->text->pos_x;port_tag_x[1]=d->name_ls->pos_x;
    /* Mode/team toggles are controlled by the two-seat host, never by unused
     * native cards. Character tokens, roster hit tests and costumes stay native. */
    for(unsigned i=0;i<4;i++){CSSDoor* d=&mnCharSel_803F0DFC.doors[i];d->togglebtn_left=d->togglebtn_right=d->teambtn_left=d->teambtn_right=1000;}
    mnCharSel_804A0BC0[1]->xC+=30.8f;
    portCharacterMenuProductLayout();
}
unsigned portCharacterMenuHand(unsigned index){HSD_ASSERT(0,index<2&&mnCharSel_804A0BC0[index]);return (unsigned)mnCharSel_804A0BC0[index]->gobj;}
void portCharacterMenuProductRules(void)
{
    if(!portMenuProduct())return;
    if(mnCharSel_804D6CF6>=2)mnCharSel_804D6CF6=0;
    mnCharSel_804D6CB0->vs.start.rules.is_teams=0;
    for(unsigned i=0;i<4;i++){
        if(i>=2){mnCharSel_803F0DFC.doors[i].p_kind=3;mnCharSel_804D6CB0->vs.start.players[i].slot_type=3;}
        mnCharSel_804D6CB0->vs.start.players[i].cpu_level=9;
    }
    mnCharSel_803F0EBC.cpu_level=9;
}
void portCharacterMenuProductOpponent(unsigned cpu)
{
    HSD_ASSERT(0,portMenuProduct()&&cpu<=1&&mnCharSel_804D6CF6==0);
    mnCharSel_803F0DFC.doors[1].p_kind=cpu?1:0;
    mnCharSel_804D6CB0->vs.start.players[1].slot_type=cpu?1:0;
    mnCharSel_804D6CB0->vs.start.players[1].cpu_level=9;
}
