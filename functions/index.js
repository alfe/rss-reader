const functions = require('firebase-functions');
const admin = require('firebase-admin');
const rssParser = require('rss-parser');

admin.initializeApp();

// exports. とついているものがcloud functionに登録される
exports.fetchData = functions.pubsub
    .schedule("every 24 hours")
    .onRun(async () => {
        await fetchColumn("Yahoo news", 'https://news.yahoo.co.jp/rss/topics/top-picks.xml');
        await fetchColumn("Netlab", 'https://rss.itmedia.co.jp/rss/2.0/netlab.xml');
        return 0
    });

/**
 * RSSの情報（記事）を Cloud Firestore で保存するデータに変換
 * @param articleItem RSSの情報（記事）
 * @param sourceSite 情報ソース名
 */
const postToFireStoreData = (articleItem, sourceSite) => {
    // 正規表現でsrc内のurlを取得
    const getImageUrl = (content) => {
        if (!content) return;
        const res = articleItem.content.match("<img.*src\s*=\s*[\"|\'](.*?)[\"|\'].*>")
        return (res) ? res[1] : "";
    };

    // articleItem の中身は以下URLを参照
    // https://github.com/rbren/rss-parser#output
    return {
        title: articleItem.title || "",
        link: articleItem.link || "",
        summary: articleItem.contentSnippet || "",
        source: sourceSite,
        // pubDateはサイトによって書き方がバラバラなので、isoDate（世界標準時）から変換して形式を統一する
        date: articleItem.isoDate ? new Date(articleItem.isoDate) : "",
        imgUrl: getImageUrl(articleItem.content),
        category: articleItem.categories || ""
    };
};

/**
 * Articlesにデータを追加
 * @param articleData 記事情報
 */
const addArticleToDatabase = async (articleData) => {
    if(!articleData) return;
    
    const itemsRef = admin.firestore().collection("Articles");
    await itemsRef
        .doc(articleData.link.replace(/\/|\:/g,'_'))
        .set(articleData)
        .catch((error) => {
            console.error("エラー Article書き込み：", error);
        })
};

/**
 * Articlesにデータを追加
 * @param sourceSite 情報ソース名
 * @param url RSSのURL
 */
const fetchColumn = async (sourceSite, url) => {
    // RSS情報を読み込み、パース（データの解析と変換）する
    const parser = new rssParser();
    const feed = await parser.parseURL(url);
    if (!feed || !feed.items) {
        console.warn("WARN: RSS読み込みエラー");
        return;
    }

    // 読み込んだ情報を Cloud Firestore向けに変換して、Cloud Firestoreに追加する
    feed.items.forEach(item => {
        const articleData = postToFireStoreData(item, sourceSite);
        addArticleToDatabase(articleData);
    });
};
