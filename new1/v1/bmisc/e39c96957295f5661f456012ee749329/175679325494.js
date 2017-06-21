define( 'components/waterfall', [ 'base/MoGu' ], function ( MoGu ) {
    var doc                      = document,
        win                      = window,
        $                        = win.$,
        $doc                     = $( doc ),
        $win                     = $( win ),
        $winHeight               = $win.height(),
        $fakeDOM                 = $( '<div></div>' ),
        doT                      = MoGu.ui.getdoT(),
        // 每个 WaterFall 的实例都有独自的 id，该 id 目前用于 `destroy()` 方法
        guid                     = 1,
        isGotopRunning           = false,
        DOT                      = '.',
        DIR_DOWN                 = 'down',
        DIR_UP                   = 'up',
        FALSE                    = false,
        TRUE                     = true,
        SHOW                     = 'waterfall-optimise-show',
        HIDE                     = 'waterfall-optimise-hide',
        // 空函数，叫 NOOP 是约定俗成
        NOOP                     = function () {
            return TRUE
        },
        //设置瀑布流容器及box的属性
        STYLE_CONTAINER          = 'waterfall-container',
        STYLE_BOX                = 'waterfall-box',
        NORMAL                   = 'NORMAL',
        REVERSE                  = 'REVERSE',
        ADD_EXTRA_STYLE          = '$$AddExtraStyle',

        CONS                     = {
            NORMAL            : NORMAL,
            REVERSE           : REVERSE,
            SHOW              : SHOW,
            HIDE              : HIDE,
            FORCE_CHECK       : 'waterfall-force-check',
            EVENT_CLEAR_BACKUP: 'waterfall-clear-backup'
        },

        DEFAULT_OFFSET           = $winHeight / 2,
        SCROLL_EVENT             = 'scroll.waterfall',
        TOUCHMOVE_EVENT          = 'touchmove.waterfall',
        TOUCHEND_EVENT           = 'touchend.waterfall',

        defaultConfig            = {
            el              : '.goods-wall',
            wrapEl          : win,
            tmpl            : 'posterWall',
            type            : 'get',
            dataType        : 'jsonp',
            data            : {
                frame: 1,
                page : 1
            },
            dataName        : 'result',  //dataName 支持XX.XX eg:
            // data.tInfo
            // 该参数用于双向瀑布流，不需要手动设置。目前支持 "normal" 和 "reverse" 两种
            metaDataName    : 'result',
            layoutDirection : NORMAL,
            colGap          : 8,
            needStatics     : true,
            hasSideGap      : false,
            isEqualHeight   : false, //是否为等高瀑布流
            canFetch        : defaultScroll,
            dataHandler     : defaultConstruct,
            dataFilter      : defaultFilter,
            onBeforeFetch   : NOOP,
            onFetchStart    : NOOP,
            onFetchFinished : NOOP,
            onFetchSuccess  : NOOP,
            onFetchError    : NOOP,
            onLayoutFinished: NOOP,
            // 应该归于 plugins 里, 前期设计失误导致它单独成了个属性
            // 不对其进行修改了
            optimise        : null,
            drName          : 'r'
        },

        findCurCol               = buildFindCondition( function ( a, b ) {
            return a.max - b.max
        } ),

        findHighestCol           = buildFindCondition( function ( a, b ) {
            return b.max - a.max
        } ),

        // 这里所谓 "最矮" 的列是指 min 值最大的
        findLowestCol            = buildFindCondition( function ( a, b ) {
            return b.min - a.min
        } ),

        waterFallInstances       = [],
        waterFallInstancesLength = 0,
        prevScrollTop            = 0,
        traceLog                 = function ( eventId, extras ) {
            var trlog = win && win.logger && win.logger.log
            trlog && trlog( eventId, extras )
        },
        log                      = function () {
            return win.console ? function ( msg ) {
                console.log( msg )
            } : NOOP
        }()
        ;
    (function initExtraStyle() {
        if ( win[ ADD_EXTRA_STYLE ] ) {
            return
        }

        win[ ADD_EXTRA_STYLE ] = true

        var style       = doc.createElement( 'style' )
        style.id        = 'waterfall-optimise-style'
        style.innerHTML = '.' + SHOW + '{display:block;}' +
            '.' + HIDE + '{display:none;}' +
            '.' + STYLE_CONTAINER + '{position:relative;}' +
            '.' + STYLE_BOX + '{position:absolute;}'
        style.appendChild( doc.createTextNode( '' ) )
        doc.head.appendChild( style )
    })()

// 使用 curry 来简化代码
// 如果 col 的高度相同，那么优先获取左边的 col。findHighestCol() 也需要这样处理
    function buildFindCondition( custom ) {
        return function ( cols ) {
            if ( !cols ) {
                return null
            }

            return cols.sort( function ( a, b ) {
                return custom( a, b ) || ( a.left - b.left )
            } )[ 0 ]
        }
    }

    function getDataByPath( data, path ) {
        if ( typeof path === 'string' ) {
            path = path.split( DOT )
        }

        try {
            path && path.length && path.forEach( function ( v ) {
                data = data[ v ]
            } )
        } catch ( e ) {
            log( '数据结构错误' )
        } finally {
            return data
        }
    }

    function defaultConstruct( list, config ) {
        var helpers = config.helpers,
            obj     = {},
            key, layoutFn

        if ( !list || !list.length ) {
            return
        }

        for ( key in helpers ) {
            if ( helpers.hasOwnProperty( key ) ) {
                obj[ key ] = helpers[ key ]
            }
        }

        layoutFn = generalLayout
        layoutFn.call( this, list, config, obj )
        config.onLayoutFinished.call( this, config )

        if ( config.useOptimise ) {
            config.hasMoved = true
            this.resetCurTop()
            $doc.triggerHandler( config.touchMoveEventName )
        }
    }

    function defaultFilter( data ) {
        return getDataByPath( data, this._config._dataName ) || []
    }

    function defaultScroll( scrollTop ) {
        var $elHeight   = this.$el.height(),
            $wrapHeight = this.$wrapEl.height()

        if ( $elHeight - $wrapHeight - scrollTop < DEFAULT_OFFSET ) {
            return true
        }
    }

    function generalLayout( datas, config, obj ) {
        var $el           = this.$el,
            initTopOffset = config.initTopOffset,
            colWidth      = config.colWidth,
            useOptimise   = config.useOptimise,
            tmplFn        = config.tmplFn,
            //这里只用到了 colGapT 属性，colGapB 是不是可以去掉?
            colGap        = config.colGapT,
            frame         = config.data.frame,
            isEqualHeight = config.isEqualHeight,
            //默认盒子高度
            boxHeight     = config._boxHeight,
            str           = '',
            curCol        = null,
            // this._cols 的 max 应该始终为最高
            cols          = this._cols,
            colsHistory   = this._colsHistory,
            oldCol        = colsHistory[ frame ],
            boxes         = this._boxes,
            tmpContainer  = [],
            index         = 0,
            $boxes, $boxesLen, boxesLen, tmpHeight, searchIndex, compareTopVal,
            box

        if ( oldCol ) {
            // 这里重新定义了 cols，下面对 cols 的操作就会导致它与 this._cols 的数据不同步
            // 应该将两次结果合并
            cols = oldCol.map( function ( obj ) {
                return {
                    min  : obj.min,
                    max  : obj.min,
                    left : obj.left,
                    frame: frame
                }
            } )
        } else {
            oldCol = cols.map( function ( obj ) {
                return {
                    min  : obj.max,
                    max  : obj.max,
                    left : obj.left,
                    frame: frame
                }
            } )
        }

        /* 对于有r参数的 */
        config.rawData[ config.drName ] && ( obj.r = config.rawData[ config.drName ] )

        datas.forEach( function ( v, index ) {
            obj.v          = v
            obj.index      = index
            obj.totalIndex = config._totalIndex++
            str += tmplFn( obj )
        } )

        $el.append( $boxes = $fakeDOM.html( str ).children() )
        $boxesLen = $boxes.length

        if ( !str || !$boxesLen ) {
            return log( '没有获取到任何新的 DOM 节点, 请检查模板中是否正确处理了数据' )
        }

        // 设置和获取 DOM 属性需要分开，这是一种优化的手段，
        // 但下面这个循环里对 `width` 进行了设置，分成两个循环就没有什么必要了
        $boxes.each( function ( i, el ) {
            var height, topStyle

            // 高度会依赖于宽度，因此要先设置
            el.style.width = colWidth + 'px'

            /**
             * 获取 offsetHeight 会导致 forced reflow
             */
            if ( isEqualHeight ) {
                if ( !boxHeight ) {
                    boxHeight = config._boxHeight = el.offsetHeight
                }
                height = boxHeight
            } else {
                height = el.offsetHeight
            }

            curCol = findCurCol( cols )
            findCurCol( oldCol )
            topStyle = curCol.max + 'px'

            tmpContainer.push( {
                left            : curCol.left,
                relativeTopStyle: topStyle,
                top             : curCol.max + initTopOffset,
                width           : colWidth,
                height          : height,
                index           : i,
                el              : el,
                boxLen          : $boxesLen,
                frame           : frame,
                state           : useOptimise ? ( config.isFirstFrame ? SHOW : HIDE ) : SHOW
            } )

            curCol.max += height + colGap
        } )

        config.isFirstFrame = false

        if ( !colsHistory[ frame ] ) {
            colsHistory[ frame ] = cols.map( function ( v, i ) {
                return {
                    min  : oldCol[ i ].max,
                    max  : v.max,
                    left : oldCol[ i ].left,
                    frame: frame
                }
            } )
        }

        tmpContainer.forEach( function ( box ) {
            var el        = box.el
            el.style.top  = box.relativeTopStyle
            el.style.left = box.left + 'px'
            box.baseClass = el.className += ' waterfall-frame-' + frame + ' ' + STYLE_BOX
            el.className += ' ' + box.state
        } )

        // 确保 boxes 中的元素是按照高度来排列的
        // 因为 waterfallOptimise 中使用了二分法查找，如果顺序不对，结果就乱了。
        compareTopVal = tmpContainer[ 0 ].top
        // 双向滚动瀑布流中,数据并不总是按顺序加载,因此会导致 boxes 中数据顺序错乱
        if ( config.isBiWaterfall ) {
            boxesLen = boxes.length

            if ( boxesLen ) {
                while ( index < boxesLen ) {
                    box = boxes[ index ]

                    if ( box.frame > frame ) {
                        searchIndex = index
                        break
                    } else {
                        index += box.boxLen
                    }
                }

                searchIndex = typeof searchIndex == 'undefined' ? boxesLen : searchIndex
            } else {
                searchIndex = 0
            }

            boxes.splice.apply( boxes, [ searchIndex, 0 ].concat( tmpContainer ) )
        } else {
            if ( !boxes.length || boxes[ boxes.length - 1 ].top <= compareTopVal ) {
                this._boxes = boxes.concat( tmpContainer )
            } else {
                this._boxes = tmpContainer.concat( boxes )
            }
        }

        tmpHeight = findHighestCol( cols ).max
        if ( !this._curTop || tmpHeight > this._curTop ) {
            this.$el.height( this._curTop = tmpHeight )
        }

        this._cols = cols.map( function ( obj, i ) {
            var oldValue = this[ i ]
            return {
                min  : obj.min < oldValue.min ? obj.min : oldValue.min,
                max  : obj.max > oldValue.max ? obj.max : oldValue.max,
                left : obj.left,
                frame: frame
            }
        }, this._cols )
    }

// 参考了 CSS 中设置 `margin` 的方式，`colGap` 可以按照上右下左的方式传值
    function parseColGap( config ) {
        var originValue = config.colGap,
            iterateLen  = 4,
            gapArr, len, val

        if ( originValue !== originValue ) {
            return console.error( originValue + ' is not a valid number.' )
        }

        if ( typeof originValue == 'number' ) {
            config.colGapT = config.colGapR = config.colGapB = config.colGapL = originValue
        } else {
            gapArr = String( originValue ).split( ' ' )
            len    = gapArr.length

            if ( len == 0 || len > 4 ) {
                return console.error( originValue + '\'s format is not right.' )
            }

            while ( iterateLen-- ) {
                val = gapArr[ iterateLen ]
                if ( val === undefined ) {
                    continue
                }

                if ( isNaN( val = +val ) ) {
                    return console.error( originValue + ' contains invalid number.' )
                }

                gapArr[ iterateLen ] = val
            }

            switch ( len ) {
                case 1:
                    config.colGapT = config.colGapR = config.colGapB = config.colGapL = gapArr[ 0 ]
                    break

                case 2:
                    config.colGapT = config.colGapB = gapArr[ 0 ]
                    config.colGapR = config.colGapL = gapArr[ 1 ]
                    break

                case 3:
                    config.colGapT = gapArr[ 0 ]
                    config.colGapR = config.colGapL = gapArr[ 1 ]
                    config.colGapB = gapArr[ 2 ]
                    break

                case 4:
                    config.colGapT = gapArr[ 0 ]
                    config.colGapR = gapArr[ 1 ]
                    config.colGapB = gapArr[ 2 ]
                    config.colGapL = gapArr[ 3 ]
                    break
            }
        }
    }

    function WaterFall( config ) {
        this._config      = config
        this._currentAjax = null
        this._id          = guid++
        this._boxes       = []
        this._frames      = {
            loaded: {},
            cur   : 0,
            max   : 0,
            min   : 0 // @TODO：这里存在问题，在设置列信息的时候，这里也应该更新
        }

        this.init()
    }

    WaterFall.prototype = {
        constructor: WaterFall,

        init: function () {
            var instance   = this,
                config     = instance._config,
                colNum     = config.colNum,
                hasSideGap = config.hasSideGap,
                i          = 0,
                sideGap    = 0,
                left       = 0,
                gapL, gapR, maxGap, $el, $wrapEl, cols, colWidth

            $wrapEl = instance.$wrapEl = $( config.wrapEl )
            $el = instance.$el = $( config.el )

            if ( !$el.length ) {
                throw Error( 'el 参数指定的 DOM 元素不存在!' )
            }

            $el.addClass( STYLE_CONTAINER )

            instance._cols = cols = []
            instance._colsHistory = []

            config.initTopOffset = $el.position().top
            config.isFirstFrame  = true
            config.tmplFn        = doT.compile( config.tmpl )

            parseColGap( config )

            gapL   = config.colGapL
            gapR   = config.colGapR
            maxGap = gapR

            /**
             * 瀑布流和左右两个 side 的距离是由 gapL 决定的，gapR 只影响瀑布流元素之间的距离
             */
            if ( hasSideGap ) {
                sideGap = 2 * gapL
            }

            if ( !colNum || colNum <= 0 ) {
                throw Error( '请传入 colNum' )
            } else {
                // colGap 在计算时，如果两个边距相邻，那么取两个值中最大的
                colWidth = config.colWidth = Math.floor( ( $el.width() - sideGap - ( colNum - 1 ) * maxGap ) / colNum )
            }

            for ( ; i < colNum; i++ ) {
                if ( i == 0 ) {
                    left = hasSideGap ? gapL : 0
                } else {
                    left += colWidth + maxGap
                }

                cols.push( {
                    min  : 0,
                    max  : 0,
                    left : left,
                    frame: 0
                } )
            }

            if ( config.useOptimise = !!config.optimiseFn ) {
                this.bindTouchmoveEvent()
                config.optimiseFn.initRange( colNum )
            }

            instance.fixGotop()

            $wrapEl.on( SCROLL_EVENT, instance.scrollHandler = (function ( e, dir ) {
                if ( instance._isLock ) {
                    return
                }

                var isDown, scrollTop
                scrollTop = $wrapEl.scrollTop()

                if ( dir == DIR_DOWN ) {
                    isDown = true
                } else {
                    if ( dir == DIR_UP ) {
                        isDown = false
                    } else {
                        isDown = scrollTop >= prevScrollTop
                    }
                }

                prevScrollTop = scrollTop

                if ( instance._config.canFetch.call( instance, scrollTop, isDown ) === TRUE ) {
                    instance.fetch()
                }
            }) )
        },

        bindTouchmoveEvent: function () {
            var _this   = this,
                $wrapEl = this.$wrapEl,
                config  = _this._config,
                id      = '.' + _this._id,
                touchMoveEventName, touchEndEventName, localTimeoutID

            touchMoveEventName = config.touchMoveEventName = TOUCHMOVE_EVENT + id
            touchEndEventName = config.touchEndEventName = TOUCHEND_EVENT + id

            $doc.on( touchMoveEventName, function () {
                config.hasMoved = true
                $doc.triggerHandler( touchEndEventName )
            } ).on( touchEndEventName, function () {
                if ( !_this._isLock && config.hasMoved ) {
                    config.optimiseFn.optimise( _this._boxes, $wrapEl.scrollTop() )
                }

                config.hasMoved = false
            } )
            // 冗余代码
            $win.on( SCROLL_EVENT, function () {
                clearTimeout( localTimeoutID )
                localTimeoutID = setTimeout( function () {
                    config.optimiseFn.optimise( _this._boxes, $win.scrollTop() )
                }, 30 )
            } )
        },

        fixGotop: function () {
            var _this = this

            $doc.on( 'gotop.begin', function () {
                isGotopRunning = true
            } ).on( 'gotop.finish', function () {
                isGotopRunning = false

                _this.resetCurTop()
            } )
        },

        fetch: function ( initData ) {
            var _this  = this,
                config = _this._config,
                cData  = config.data
            if ( _this._isLoading ) {
                return
            }

            _this._isLoading = true

            if ( config.onBeforeFetch.call( _this, config ) === FALSE ) {
                _this._isLoading = false
                return
            }

            _this._config.onFetchStart.call( _this, config )

            if ( this.isFrameLoaded( config.data.frame ) ) {
                _this._isLoading = false
                return
            }

            // 隐藏 bug, 如果 initData 存在, 那么此时 start() 方法
            // 未执行完毕, 瀑布流的实例没有返回, 如果这个时候在 callback
            // 中调用 waterfallInstance 的方法, 会提示该变量不存在
            if ( initData ) {
                setTimeout( function () {
                    fetchCompleteCallback( null, 200 )
                    fetchSuccessCallback( initData )
                }, 0 )
                return
            }

            this._currentAjax = $.ajax( {
                type    : config.type,
                dataType: config.dataType,
                data    : cData,
                url     : config.url,
                success : fetchSuccessCallback,
                error   : fetchErrorCallback,
                complete: fetchCompleteCallback
            } )

            function fetchCompleteCallback( xhr, status ) {
                config.onFetchFinished.call( _this, xhr, status )
                _this._isLoading = false
            }

            function fetchSuccessCallback( data ) {
                var frames   = _this._frames,
                    curFrame = cData.frame,
                    result   = getDataByPath( data, config._metaDataName ) || {}

                config.rawData = data
                data           = config.dataFilter.call( _this, data )
                //统计数据
                config.needStatics && dataStatics( result, data )
                config.onFetchSuccess.call( _this, data, config )
                config.dataHandler.call( _this, data, config )

                frames.loaded[ cData.frame ] = 1

                if ( frames.max < curFrame ) {
                    frames.max = curFrame
                }

                if ( frames.min > curFrame ) {
                    frames.min = curFrame
                }

                if ( config.layoutDirection == NORMAL ) {
                    cData.frame++
                } else {
                    cData.frame--
                }

                cData.trace      = data.trace || 0
                cData.cpc_offset = result.cpc_offset
                cData.page       = cData.frame
            }

            function fetchErrorCallback( xhr, errorType, error ) {
                _this._isLoading = false
                config.onFetchError.call( _this, error, errorType )
            }
        },

        // 默认初始化结束后，不会主动请求数据，需要手动执行 start() 方法
        // 对 fetch 的封装，名字看起来更清晰一些
        start: function ( initData ) {
            this.fetch( initData )
            return this
        },

        // 被锁定的对象不响应 window 的 scroll 事件
        lock: function () {
            this._isLock = true
            return this
        },

        // 瀑布流是否正在加载数据
        isLoading: function () {
            return this._isLoading
        },

        // API 不应该将内部对象直接暴露出去，这样的引用会造成不必要的麻烦
        getColsInfo: function () {
            return $.extend( true, [], this._cols )
        },

        getColsHistoryInfo: function () {
            return $.extend( true, [], this._colsHistory )
        },

        setColsHistoryInfo: function ( history ) {
            this._colsHistory = $.extend( true, [], history )
            return this
        },

        setColsInfo: function ( cols ) {
            if ( cols && cols.length ) {
                this._cols = $.extend( true, [], cols )
            }
            return this
        },

        /**
         * 获取 _config 上的属性
         * @param name
         * @returns {*}
         */
        getParam: function ( name ) {
            return this._config[ name ]
        },

        /**
         * 更新配置对象中的值
         */
        updateParam: function ( name, value ) {
            this._config[ name ] = value
            return this
        },

        /**
         * 根据 path 来过滤数据
         * @data: 需要过滤的原始数据
         * @path: 数据所在的路径, 可以是数组, 也可以是用 DOT 分隔的字符串
         */
        getDataByPath: getDataByPath,

        updateLayoutDirection: function ( dir ) {
            if ( dir in CONS ) {
                this._config.layoutDirection = dir
            } else {
                throw Error( dir + ' is not a valid direction.' )
            }
            return this
        },

        findLowestCol: function () {
            return findLowestCol( this._cols )
        },

        findHighestCol: function () {
            return findHighestCol( this._cols )
        },

        isFrameLoaded: function ( frameIndex ) {
            return !!this._frames.loaded[ frameIndex ]
        },

        getCurrentFrame: function () {
            return this._config.data.frame
        },

        unlock: function () {
            this._isLock = false
            return this
        },

        //TODO: plugin destroy
        destroy: function () {
            if ( this._currentAjax ) {
                this._currentAjax.abort()
            }

            this.$wrapEl.off( SCROLL_EVENT, this.scrollHandler )
        },

        resetCurTop: function () {
            this._boxes._curTop = -9999
            return this
        },

        triggerScroll: function ( dir ) {
            this.$wrapEl.triggerHandler( SCROLL_EVENT, [ dir || DIR_DOWN ] )
            return this
        },

        CONS: CONS
    }

    function dataStatics( data, list ) {
        if ( !data ) {
            return
        }

        var page              = data.page,
            baseNum           = ( page - 1 ) * list.length,
            traceLogItemsInfo = [],
            cpcGoods          = [],
            acms              = [],
            goodsIndex        = [],
            types             = [],
            eventID           = data.param ? data.param.eventId : ( data.eventId || '' )

        list.forEach( function ( item, i ) {
            if ( item.link && item.link.indexOf( 'cparam' ) !== -1 && item.tradeItemId ) {
                cpcGoods.push( item.tradeItemId )
            }

            if ( item.tradeItemId ) {
                traceLogItemsInfo.push( item.tradeItemId )
            }

            if ( item.acm ) {
                acms.push( item.acm )
            }

            types.push( item.itemType )

            goodsIndex.push( baseNum + i )
        } )

        traceLog( eventID, {
            cpcs    : cpcGoods,
            acms    : acms,
            indexs  : goodsIndex,
            iids    : traceLogItemsInfo,
            ptpPartC: data.ptpPartC,
            eventid : eventID,
            types   : types
        } )
    }

    return {
        CONS: CONS,

        init: function ( config ) {
            var instance, plugins, takeOverPlugin, result, index
            config = $.extend( true, {
                _totalIndex: 0
            }, defaultConfig, config )

            typeof config.dataName === 'string' && ( config._dataName = config.dataName.split( DOT ) )
            typeof config.metaDataName === 'string' && ( config._metaDataName = config.metaDataName.split( DOT ) )

            plugins = config.plugins

            if ( plugins ) {
                if ( Array.isArray( plugins ) ) {
                    result = plugins.some( function ( v, i ) {
                        return v.takeOver && ( index = i, 1 )
                    } )

                    if ( result ) {
                        takeOverPlugin = config.plugins.splice( index, 1 )[ 0 ]
                        return takeOverPlugin.init( config )
                    }
                }

                if ( plugins.takeOver ) {
                    delete config.plugins
                    return plugins.init( config )
                }
            }

            waterFallInstances.push( instance = new WaterFall( config ) )
            waterFallInstancesLength++

            plugins && plugins.forEach( function ( v ) {
                v.init( instance )
            } )

            return instance
        }
    }
} )
