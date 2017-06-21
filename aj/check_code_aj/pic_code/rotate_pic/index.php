<?php
header('Content-Type:text/plain; charset=utf-8');
$json=<<<END
{"code":0,"message":"\u56fe\u7247\u8bf7\u6c42\u6210\u529f","data":{"captcha_type":"c4","msg":"\u8bf7\u65cb\u8f6c\u56fe\u7247\u4e3a\u6b63\u786e\u65b9\u5411","captcha_urls":["http:\/\/d06.res.meilishuo.net\/pic\/_o\/10\/b3\/c5ba5cd02abb221cef7c0d1b4454_100_100.cj.jpg","http:\/\/d06.res.meilishuo.net\/pic\/_o\/46\/b8\/d478dd02f8cdeb9c13f1f2f66b82_100_100.cj.jpg","http:\/\/d06.res.meilishuo.net\/pic\/_o\/5f\/d9\/b2d9ff50dfd8a3895ee26be7fd9f_100_100.cj.jpg","http:\/\/d06.res.meilishuo.net\/pic\/_o\/7d\/30\/f622467de19a435d58f6aac7b5aa_100_100.cj.jpg"]}}
END;
echo $json;
